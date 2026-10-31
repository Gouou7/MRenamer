use crate::model::{AppError, FileEntry, RenameRule, Result, RuleConfig};
use chrono::{DateTime, FixedOffset, Local};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path, sync::OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableDefinition {
    pub name: String,
    pub category: String,
    pub label_key: String,
    pub description_key: String,
    pub example: String,
}

pub fn variables() -> &'static [VariableDefinition] {
    static CATALOG: OnceLock<Vec<VariableDefinition>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/lib/variables.json"))
            .expect("the bundled variable catalog must be valid")
    })
}

#[derive(Debug, Clone)]
enum Part {
    Text(String),
    Variable(String),
}

#[derive(Debug, Clone)]
pub struct Template(Vec<Part>);

#[derive(Debug, Clone, Default)]
pub struct FileTimes {
    pub created: Option<DateTime<FixedOffset>>,
    pub modified: Option<DateTime<FixedOffset>>,
}

#[derive(Debug, Clone)]
pub struct TemplateSnapshot {
    pub now: DateTime<FixedOffset>,
    pub files: HashMap<String, FileTimes>,
}

impl Default for TemplateSnapshot {
    fn default() -> Self {
        Self {
            now: Local::now().fixed_offset(),
            files: HashMap::new(),
        }
    }
}

pub struct Context<'a> {
    pub entry: &'a FileEntry,
    pub current_name: &'a str,
    pub snapshot: &'a TemplateSnapshot,
}

// Text fragments retain regex capture syntax; resolved variable values are always literal.
pub struct ExpandedTemplate(Vec<(String, bool)>);

impl ExpandedTemplate {
    pub fn render(&self, captures: Option<&regex::Captures<'_>>) -> String {
        let mut output = String::new();
        for (text, literal) in &self.0 {
            if let Some(captures) = captures.filter(|_| !literal) {
                captures.expand(text, &mut output);
            } else {
                output.push_str(text);
            }
        }
        output
    }
}

fn syntax(reason: &str, variable: &str) -> AppError {
    AppError::new("invalidRule", reason).with_params([("variable", variable)])
}

impl Template {
    pub fn parse(input: &str) -> Result<Self> {
        let mut chars = input.chars().peekable();
        let mut parts = Vec::new();
        let mut text = String::new();
        while let Some(ch) = chars.next() {
            match ch {
                '<' | '>' if chars.peek() == Some(&ch) => {
                    chars.next();
                    text.push(ch);
                }
                '<' => {
                    if !text.is_empty() {
                        parts.push(Part::Text(std::mem::take(&mut text)));
                    }
                    let mut name = String::new();
                    let mut closed = false;
                    for ch in chars.by_ref() {
                        if ch == '>' {
                            closed = true;
                            break;
                        }
                        if !ch.is_ascii_alphanumeric() {
                            return Err(syntax("templateSyntax", &name));
                        }
                        name.push(ch);
                    }
                    if !closed || name.is_empty() {
                        return Err(syntax("templateSyntax", &name));
                    }
                    let variable = variables()
                        .iter()
                        .find(|v| v.name.eq_ignore_ascii_case(&name))
                        .ok_or_else(|| syntax("unknownVariable", &name))?;
                    parts.push(Part::Variable(variable.name.clone()));
                }
                '>' => return Err(syntax("templateSyntax", "")),
                _ => text.push(ch),
            }
        }
        if !text.is_empty() {
            parts.push(Part::Text(text));
        }
        Ok(Self(parts))
    }

    pub fn needs_created(&self) -> bool {
        self.0
            .iter()
            .any(|part| matches!(part, Part::Variable(name) if name.starts_with("Created")))
    }

    pub fn needs_modified(&self) -> bool {
        self.0
            .iter()
            .any(|part| matches!(part, Part::Variable(name) if name.starts_with("Modified")))
    }

    pub fn expand(&self, context: &Context<'_>) -> Result<ExpandedTemplate> {
        self.0
            .iter()
            .map(|part| match part {
                Part::Text(text) => Ok((text.clone(), false)),
                Part::Variable(name) => context.resolve(name).map(|text| (text, true)),
            })
            .collect::<Result<Vec<_>>>()
            .map(ExpandedTemplate)
    }
}

pub fn compile(rule_list: &[RenameRule]) -> Result<Vec<Option<Template>>> {
    rule_list
        .iter()
        .map(|rule| {
            if !rule.enabled {
                return Ok(None);
            }
            crate::rules::validate(rule)?;
            match &rule.config {
                RuleConfig::Add { text, .. } => Template::parse(text).map(Some),
                RuleConfig::Replace { replacement, .. } => Template::parse(replacement).map(Some),
                _ => Ok(None),
            }
        })
        .collect()
}

fn split_name(name: &str, directory: bool) -> (&str, &str) {
    match name.rfind('.').filter(|&i| !directory && i > 0) {
        Some(i) => (&name[..i], &name[i + 1..]),
        None => (name, ""),
    }
}

impl Context<'_> {
    fn unavailable(&self, variable: &str, reason: &str) -> AppError {
        AppError::new("variableUnavailable", "")
            .with_params([("variable", variable), ("reason", reason)])
    }

    fn resolve(&self, variable: &str) -> Result<String> {
        let directory = self.entry.kind == "directory";
        let original = split_name(&self.entry.name, directory);
        let current = split_name(self.current_name, directory);
        let date_format = |suffix: &str| match suffix {
            "Date" => "%Y-%m-%d",
            "Time" => "%H-%M-%S",
            _ => "%Y-%m-%d_%H-%M-%S",
        };
        Ok(match variable {
            "Name" => self.entry.name.clone(),
            "Stem" => original.0.into(),
            "Ext" => original.1.into(),
            "CName" => self.current_name.into(),
            "CStem" => current.0.into(),
            "CExt" => current.1.into(),
            "Date" | "Time" | "DateTime" => {
                self.snapshot.now.format(date_format(variable)).to_string()
            }
            "Year" => self.snapshot.now.format("%Y").to_string(),
            "Month" => self.snapshot.now.format("%m").to_string(),
            "Day" => self.snapshot.now.format("%d").to_string(),
            name if name.starts_with("ParentDir") => {
                let depth = name.strip_prefix("ParentDir").unwrap();
                let depth = if depth.is_empty() {
                    1
                } else {
                    depth.parse::<usize>().unwrap()
                };
                Path::new(&self.entry.path)
                    .ancestors()
                    .nth(depth)
                    .and_then(Path::file_name)
                    .and_then(|name| name.to_str())
                    .ok_or_else(|| self.unavailable(variable, "parentMissing"))?
                    .into()
            }
            name if name.starts_with("Created") || name.starts_with("Modified") => {
                let created = name.starts_with("Created");
                let time = self
                    .snapshot
                    .files
                    .get(&self.entry.id)
                    .and_then(|times| {
                        if created {
                            times.created.as_ref()
                        } else {
                            times.modified.as_ref()
                        }
                    })
                    .ok_or_else(|| {
                        self.unavailable(
                            variable,
                            if created {
                                "createdTimeUnavailable"
                            } else {
                                "modifiedTimeUnavailable"
                            },
                        )
                    })?;
                time.format(date_format(if created { &name[7..] } else { &name[8..] }))
                    .to_string()
            }
            _ => return Err(syntax("unknownVariable", variable)),
        })
    }
}
