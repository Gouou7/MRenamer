use crate::template::{self, FileTimes, Template, TemplateSnapshot};
use crate::{model::*, platform, rules, storage::Journal};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub struct Engine {
    pub entries: HashMap<String, FileEntry>,
    plan: Option<StoredPlan>,
    pub journal: Journal,
}
impl Engine {
    pub fn open(database: &Path) -> Result<Self> {
        Ok(Self {
            entries: HashMap::new(),
            plan: None,
            journal: Journal::open(database)?,
        })
    }
    pub fn scan(
        &mut self,
        paths: Vec<String>,
        contents: bool,
        recursive: bool,
        progress: &dyn Fn(Progress),
    ) -> Result<Vec<FileEntry>> {
        self.plan = None;
        let mut result = Vec::new();
        let mut seen = HashSet::new();
        let mut stack: Vec<(PathBuf, bool)> = paths
            .into_iter()
            .map(|p| (PathBuf::from(p), true))
            .collect();
        while let Some((raw, root)) = stack.pop() {
            let lexical = if raw.is_absolute() {
                raw
            } else {
                std::env::current_dir()?.join(raw)
            };
            let link = platform::check_ancestors(&lexical).is_err();
            let path = if link {
                lexical
            } else {
                dunce::canonicalize(&lexical)?
            };
            let key = path
                .to_str()
                .ok_or_else(|| AppError::new("unsupportedName", path.display()))?
                .to_string();
            if !seen.insert(key.clone()) {
                continue;
            }
            let metadata = std::fs::symlink_metadata(&path)?;
            let unsafe_parent = platform::check_ancestors(&path).is_err();
            let kind = if link || unsafe_parent {
                "link"
            } else if metadata.is_dir() {
                "directory"
            } else if metadata.is_file() {
                "file"
            } else {
                "unsupported"
            };
            let identity = if kind == "file" || kind == "directory" {
                Some(fingerprint(&path)?)
            } else {
                None
            };
            let id = key.clone();
            let entry = FileEntry {
                id: id.clone(),
                path: key,
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                kind: kind.into(),
                fingerprint: identity,
                error: if kind == "link" {
                    Some("unsupportedLink".into())
                } else if kind == "unsupported" {
                    Some("unsupportedName".into())
                } else {
                    None
                },
            };
            self.entries.insert(id, entry.clone());
            result.push(entry);
            if result.len() % 100 == 0 {
                progress(Progress {
                    phase: "scan".into(),
                    done: result.len(),
                    total: 0,
                });
            }
            if kind == "directory" && contents && (root || recursive) {
                let mut children = std::fs::read_dir(&path)?
                    .map(|r| r.map(|e| e.path()))
                    .collect::<std::io::Result<Vec<_>>>()?;
                children.sort();
                for child in children.into_iter().rev() {
                    stack.push((child, false));
                }
            }
        }
        result.sort_by(|a, b| a.path.cmp(&b.path));
        progress(Progress {
            phase: "scan".into(),
            done: result.len(),
            total: result.len(),
        });
        Ok(result)
    }
    pub fn scan_folder_contents(
        &mut self,
        paths: Vec<String>,
        include_files: bool,
        include_folders: bool,
        recursive: bool,
        progress: &dyn Fn(Progress),
    ) -> Result<Vec<FileEntry>> {
        self.plan = None;
        let mut children = Vec::new();
        for path in paths {
            let path = Path::new(&path);
            platform::check_ancestors(path)?;
            for child in std::fs::read_dir(path)? {
                children.push(
                    child?
                        .path()
                        .to_str()
                        .ok_or_else(|| AppError::new("unsupportedName", path.display()))?
                        .to_string(),
                );
            }
        }
        let mut entries = self.scan(children, recursive, recursive, progress)?;
        entries.retain(|entry| match entry.kind.as_str() {
            "file" => include_files,
            "directory" => include_folders,
            _ => true,
        });
        Ok(entries)
    }
    pub fn preview(
        &mut self,
        ids: Vec<String>,
        selected: Vec<String>,
        rule_list: Vec<RenameRule>,
        revision: u64,
    ) -> Result<RenamePlan> {
        self.plan = None;
        let templates = template::compile(&rule_list)?;
        let needs_created = templates.iter().flatten().any(Template::needs_created);
        let needs_modified = templates.iter().flatten().any(Template::needs_modified);
        let mut snapshot = TemplateSnapshot::default();
        let chosen: HashSet<&str> = selected.iter().map(String::as_str).collect();
        let entries = ids
            .iter()
            .map(|id| {
                let mut entry = self
                    .entries
                    .get(id)
                    .cloned()
                    .ok_or_else(|| AppError::new("stalePlan", id))?;
                if entry.error.is_none() {
                    platform::check_ancestors(Path::new(&entry.path))?;
                    entry.fingerprint = Some(fingerprint(Path::new(&entry.path))?);
                    if chosen.contains(entry.id.as_str()) && (needs_created || needs_modified) {
                        let metadata = std::fs::symlink_metadata(&entry.path)?;
                        if metadata.file_type().is_symlink() {
                            return Err(AppError::new("stalePlan", &entry.path));
                        }
                        let local =
                            |time| chrono::DateTime::<chrono::Local>::from(time).fixed_offset();
                        snapshot.files.insert(
                            entry.id.clone(),
                            FileTimes {
                                created: needs_created
                                    .then(|| metadata.created().ok().map(local))
                                    .flatten(),
                                modified: needs_modified
                                    .then(|| metadata.modified().ok().map(local))
                                    .flatten(),
                            },
                        );
                    }
                }
                Ok(entry)
            })
            .collect::<Result<Vec<_>>>()?;
        let preview = calculate_compiled(
            &entries, &selected, &rule_list, revision, &templates, &snapshot,
        )?;
        self.plan = Some(StoredPlan {
            preview: preview.clone(),
            entries,
            rules: rule_list,
            selected,
            templates,
            snapshot,
        });
        Ok(preview)
    }
    pub fn execute(&mut self, id: &str, progress: &dyn Fn(Progress)) -> Result<HistoryEntry> {
        if self
            .journal
            .history()?
            .iter()
            .any(|h| matches!(h.status.as_str(), "running" | "undoing" | "recoveryNeeded"))
        {
            return Err(AppError::new("recoveryRequired", ""));
        }
        let plan = self
            .plan
            .take()
            .filter(|p| p.preview.id == id)
            .ok_or_else(|| AppError::new("stalePlan", ""))?;
        if plan.preview.conflicts > 0 || plan.preview.changes == 0 {
            return Err(AppError::new("conflicts", ""));
        }
        for e in &plan.entries {
            if let Some(old) = &e.fingerprint {
                platform::check_ancestors(Path::new(&e.path))?;
                if fingerprint(Path::new(&e.path))? != *old {
                    return Err(AppError::new("stalePlan", &e.path));
                }
            }
        }
        let rechecked = calculate_compiled(
            &plan.entries,
            &plan.selected,
            &plan.rules,
            plan.preview.revision,
            &plan.templates,
            &plan.snapshot,
        )?;
        if rechecked.conflicts > 0 {
            return Err(AppError::new("conflicts", ""));
        }
        let op = Uuid::new_v4().to_string();
        self.journal.create(&op, plan.preview.changes)?;
        let mut groups: BTreeMap<PathBuf, Vec<&PreviewRow>> = BTreeMap::new();
        for row in &plan.preview.rows {
            if row.selected && row.original_name != row.new_name && row.error.is_none() {
                groups
                    .entry(
                        Path::new(&row.original_path)
                            .parent()
                            .unwrap()
                            .to_path_buf(),
                    )
                    .or_default()
                    .push(row);
            }
        }
        let mut groups = groups.into_iter().collect::<Vec<_>>();
        groups.sort_by_key(|(p, _)| std::cmp::Reverse(p.components().count()));
        let mut seq = 0i64;
        let result = (|| -> Result<()> {
            for (parent, rows) in groups {
                let mut staged = Vec::new();
                for row in rows {
                    let temp = parent.join(format!(".renamer-{}", Uuid::new_v4()));
                    let expected = &plan
                        .entries
                        .iter()
                        .find(|e| e.id == row.id)
                        .unwrap()
                        .fingerprint
                        .as_ref()
                        .unwrap()
                        .identity;
                    self.move_step(
                        &op,
                        &mut seq,
                        Path::new(&row.original_path),
                        &temp,
                        expected,
                    )?;
                    staged.push((temp, parent.join(&row.new_name), expected.clone()));
                }
                for (from, to, identity) in staged {
                    self.move_step(&op, &mut seq, &from, &to, &identity)?;
                    progress(Progress {
                        phase: "execute".into(),
                        done: (seq as usize) / 2,
                        total: plan.preview.changes,
                    });
                }
            }
            self.journal.status(&op, "completed", "")?;
            Ok(())
        })();
        if let Err(error) = result {
            match self.restore(&op, progress) {
                Ok(()) => self.journal.status(&op, "rolledBack", &error.detail)?,
                Err(rollback) => self.journal.status(
                    &op,
                    "recoveryNeeded",
                    &format!("{}\n{}", error.detail, rollback.detail),
                )?,
            }
            return Err(AppError::new(
                if self
                    .journal
                    .history()?
                    .iter()
                    .any(|h| h.id == op && h.status == "recoveryNeeded")
                {
                    "recoveryRequired"
                } else {
                    "rolledBack"
                },
                error.detail,
            ));
        }
        Ok(self
            .journal
            .history()?
            .into_iter()
            .find(|h| h.id == op)
            .unwrap())
    }
    fn move_step(
        &self,
        op: &str,
        seq: &mut i64,
        from: &Path,
        to: &Path,
        identity: &str,
    ) -> Result<()> {
        if fingerprint(from)?.identity != identity {
            return Err(AppError::new("stalePlan", from.display()));
        }
        self.journal.prepare(
            op,
            *seq,
            from.to_str().unwrap(),
            to.to_str().unwrap(),
            identity,
        )?;
        platform::rename_no_replace(from, to)?;
        self.journal.step_state(op, *seq, "applied")?;
        *seq += 1;
        Ok(())
    }
    fn restore(&self, id: &str, progress: &dyn Fn(Progress)) -> Result<()> {
        let steps = self.journal.steps(id)?;
        // Simulate the reverse directory moves first so a conflict blocks undo
        // before any object is touched, even when children currently live under renamed parents.
        let mut moves: Vec<(PathBuf, PathBuf)> = Vec::new();
        let virtual_path = |path: &Path, moves: &[(PathBuf, PathBuf)]| -> Option<PathBuf> {
            let mut value = path.to_path_buf();
            for (from, to) in moves.iter().rev() {
                if let Some(rest) = strip_prefix_fs(&value, to) {
                    value = if rest.as_os_str().is_empty() {
                        from.clone()
                    } else {
                        from.join(rest)
                    };
                } else if strip_prefix_fs(&value, from).is_some() {
                    return None;
                }
            }
            Some(value)
        };
        for s in &steps {
            if s.state == "undone" {
                continue;
            }
            let a = virtual_path(Path::new(&s.from), &moves);
            let b = virtual_path(Path::new(&s.to), &moves);
            let own = b
                .as_ref()
                .and_then(|p| fingerprint(p).ok())
                .is_some_and(|f| f.identity == s.identity);
            if own {
                if a.as_ref()
                    .is_some_and(|p| std::fs::symlink_metadata(p).is_ok())
                {
                    return Err(AppError::new("undoConflict", &s.from));
                }
                moves.push((PathBuf::from(&s.to), PathBuf::from(&s.from)));
            } else if !a
                .as_ref()
                .and_then(|p| fingerprint(p).ok())
                .is_some_and(|f| f.identity == s.identity)
            {
                return Err(AppError::new("undoConflict", &s.to));
            }
        }
        for (i, s) in steps.iter().enumerate() {
            if s.state == "undone" {
                continue;
            }
            let source = Path::new(&s.from);
            let target = Path::new(&s.to);
            let from_identity = fingerprint(source).ok().map(|f| f.identity);
            let to_identity = fingerprint(target).ok().map(|f| f.identity);
            if to_identity.as_deref() == Some(s.identity.as_str()) {
                if std::fs::symlink_metadata(source).is_ok() {
                    return Err(AppError::new("undoConflict", source.display()));
                }
                platform::rename_no_replace(target, source)?;
            } else if from_identity.as_deref() != Some(s.identity.as_str()) {
                return Err(AppError::new("undoConflict", target.display()));
            }
            self.journal.step_state(id, s.seq, "undone")?;
            progress(Progress {
                phase: "undo".into(),
                done: i + 1,
                total: steps.len(),
            });
        }
        Ok(())
    }
    pub fn undo(&mut self, id: &str, progress: &dyn Fn(Progress)) -> Result<HistoryEntry> {
        self.plan = None;
        let history = self.journal.history()?;
        let latest = history
            .iter()
            .find(|h| {
                matches!(
                    h.status.as_str(),
                    "completed" | "recoveryNeeded" | "undoing" | "running"
                )
            })
            .ok_or_else(|| AppError::new("nothingToUndo", ""))?;
        if latest.id != id {
            return Err(AppError::new("undoOrder", ""));
        }
        self.journal.status(id, "undoing", "")?;
        if let Err(e) = self.restore(id, progress) {
            self.journal.status(id, "recoveryNeeded", &e.detail)?;
            return Err(e);
        }
        self.journal.status(id, "undone", "")?;
        Ok(self
            .journal
            .history()?
            .into_iter()
            .find(|h| h.id == id)
            .unwrap())
    }
}

fn projected(path: &Path, names: &HashMap<PathBuf, String>) -> PathBuf {
    let mut original = PathBuf::new();
    let mut result = PathBuf::new();
    for c in path.components() {
        original.push(c.as_os_str());
        result.push(
            names
                .get(&original)
                .map(std::ffi::OsStr::new)
                .unwrap_or(c.as_os_str()),
        );
    }
    result
}

pub fn calculate(
    entries: &[FileEntry],
    selected: &[String],
    rule_list: &[RenameRule],
    revision: u64,
) -> Result<RenamePlan> {
    calculate_with_context(
        entries,
        selected,
        rule_list,
        revision,
        &TemplateSnapshot::default(),
    )
}

pub fn calculate_with_context(
    entries: &[FileEntry],
    selected: &[String],
    rule_list: &[RenameRule],
    revision: u64,
    snapshot: &TemplateSnapshot,
) -> Result<RenamePlan> {
    let templates = template::compile(rule_list)?;
    calculate_compiled(entries, selected, rule_list, revision, &templates, snapshot)
}

fn calculate_compiled(
    entries: &[FileEntry],
    selected: &[String],
    rule_list: &[RenameRule],
    revision: u64,
    templates: &[Option<Template>],
    snapshot: &TemplateSnapshot,
) -> Result<RenamePlan> {
    let chosen: HashSet<&str> = selected.iter().map(String::as_str).collect();
    let mut counters: HashMap<(String, String), usize> = HashMap::new();
    let mut names = HashMap::new();
    let mut rows = Vec::new();
    for e in entries {
        let active = chosen.contains(e.id.as_str()) && e.error.is_none();
        let mut name = e.name.clone();
        let mut variable_error = None;
        if active {
            for (rule, template) in rule_list.iter().zip(templates).filter(|(r, _)| r.enabled) {
                // Resolve current-name variables before splitting the configured scope.
                let has_scope = rule.scope != "extension"
                    || (e.kind != "directory" && name.rfind('.').is_some_and(|i| i > 0));
                let expansion = if has_scope {
                    match template
                        .as_ref()
                        .map(|template| {
                            template.expand(&template::Context {
                                entry: e,
                                current_name: &name,
                                snapshot,
                            })
                        })
                        .transpose()
                    {
                        Ok(expansion) => expansion,
                        Err(error) => {
                            variable_error = Some(error);
                            break;
                        }
                    }
                } else {
                    None
                };
                let group = if matches!(
                    &rule.config,
                    RuleConfig::Number {
                        per_directory: true,
                        ..
                    }
                ) {
                    Path::new(&e.path)
                        .parent()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned()
                } else {
                    String::new()
                };
                let counter = counters.entry((rule.id.clone(), group)).or_default();
                name = rules::apply_scoped_expanded(
                    &name,
                    e.kind == "directory",
                    rule,
                    *counter,
                    expansion.as_ref(),
                )?;
                *counter += 1;
            }
        }
        let error_params = variable_error
            .as_ref()
            .and_then(|error| error.params.clone());
        let error = if let Some(error) = variable_error {
            name = e.name.clone();
            Some(error.code)
        } else if active && !platform::valid_name(&name) {
            Some("invalidName".into())
        } else {
            e.error.clone()
        };
        if active && name != e.name && error.is_none() {
            names.insert(PathBuf::from(&e.path), name.clone());
        }
        rows.push(PreviewRow {
            id: e.id.clone(),
            original_path: e.path.clone(),
            target_path: e.path.clone(),
            original_name: e.name.clone(),
            new_name: name,
            kind: e.kind.clone(),
            selected: active,
            status: "unchanged".into(),
            error,
            error_params,
        });
    }
    let changing: HashMap<PathBuf, &FileEntry> = entries
        .iter()
        .filter(|e| names.contains_key(Path::new(&e.path)))
        .map(|e| (PathBuf::from(&e.path), e))
        .collect();
    let mut destinations: HashMap<PathBuf, usize> = HashMap::new();
    // Detect aliasing on the actual filesystem, including case-insensitive volumes.
    for i in 0..rows.len() {
        let original_path = rows[i].original_path.clone();
        let original = Path::new(&original_path);
        let target_local = original.with_file_name(&rows[i].new_name);
        // projected expects original components: avoid mapping a swapped new basename twice.
        rows[i].target_path = projected(original.parent().unwrap_or(Path::new("")), &names)
            .join(&rows[i].new_name)
            .to_string_lossy()
            .into_owned();
        if !rows[i].selected {
            rows[i].new_name = rows[i].original_name.clone();
            continue;
        }
        if rows[i].error.is_some() {
            continue;
        }
        if let Some(other) = destinations.insert(target_local.clone(), i) {
            rows[i].error = Some("duplicateTarget".into());
            rows[other].error = Some("duplicateTarget".into());
        }
        if rows[i].original_name != rows[i].new_name
            && std::fs::symlink_metadata(&target_local).is_ok()
        {
            let occupant = fingerprint(&target_local).ok();
            let allowed = occupant.as_ref().is_some_and(|fp| {
                changing.values().any(|e| {
                    e.fingerprint
                        .as_ref()
                        .is_some_and(|own| own.identity == fp.identity)
                        && strip_prefix_fs(&target_local, Path::new(&e.path))
                            .is_some_and(|rest| rest.as_os_str().is_empty())
                })
            });
            if !allowed {
                rows[i].error = Some("targetExists".into());
            }
        }
    }
    // Non-existing destinations differing only in case require volume-aware validation.
    // Windows per-directory case sensitivity is queried rather than assumed globally.
    let mut folded: HashMap<(PathBuf, String), usize> = HashMap::new();
    let mut sensitivity: HashMap<PathBuf, bool> = HashMap::new();
    for i in 0..rows.len() {
        if !rows[i].selected || rows[i].error.is_some() {
            continue;
        }
        let parent = Path::new(&rows[i].original_path)
            .parent()
            .unwrap()
            .to_path_buf();
        if !*sensitivity
            .entry(parent.clone())
            .or_insert_with(|| case_sensitive(&parent))
        {
            let key = (parent, rows[i].new_name.to_lowercase());
            if let Some(other) = folded.insert(key, i) {
                rows[i].error = Some("duplicateTarget".into());
                rows[other].error = Some("duplicateTarget".into());
            }
        }
    }
    for row in &mut rows {
        row.status = if row.error.is_some() {
            "error"
        } else if row.original_path != row.target_path {
            "changed"
        } else {
            "unchanged"
        }
        .into();
    }
    let changes = rows
        .iter()
        .filter(|r| r.selected && r.error.is_none() && r.original_name != r.new_name)
        .count();
    let conflicts = rows
        .iter()
        .filter(|r| r.selected && r.error.is_some())
        .count();
    Ok(RenamePlan {
        id: Uuid::new_v4().to_string(),
        revision,
        rows,
        changes,
        conflicts,
    })
}

fn case_sensitive(parent: &Path) -> bool {
    if let Some(value) = platform::case_sensitivity(parent) {
        return value;
    }
    // Query using an existing entry with a letter, without writing probe files.
    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let altered: String = name
                .chars()
                .map(|c| {
                    if c.is_lowercase() {
                        c.to_uppercase().to_string()
                    } else {
                        c.to_lowercase().to_string()
                    }
                })
                .collect();
            if altered == name {
                continue;
            }
            let alternate = parent.join(altered);
            if let (Ok(a), Ok(b)) = (fingerprint(&entry.path()), fingerprint(&alternate)) {
                if a.identity == b.identity {
                    return false;
                }
            }
            return true;
        }
    }
    // Empty Windows directories default to insensitive; macOS defaults to insensitive.
    !cfg!(any(windows, target_os = "macos"))
}

fn strip_prefix_fs(path: &Path, prefix: &Path) -> Option<PathBuf> {
    if let Ok(rest) = path.strip_prefix(prefix) {
        return Some(rest.to_path_buf());
    }
    if case_sensitive(prefix.parent().unwrap_or(prefix)) {
        return None;
    }
    let a = path.components().collect::<Vec<_>>();
    let b = prefix.components().collect::<Vec<_>>();
    if a.len() < b.len()
        || !a.iter().zip(&b).all(|(x, y)| {
            x.as_os_str().to_string_lossy().to_lowercase()
                == y.as_os_str().to_string_lossy().to_lowercase()
        })
    {
        return None;
    }
    Some(a[b.len()..].iter().map(|c| c.as_os_str()).collect())
}
