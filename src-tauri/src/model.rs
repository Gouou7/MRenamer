use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub detail: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<std::collections::HashMap<String, String>>,
}
impl AppError {
    pub fn new(code: &str, detail: impl ToString) -> Self {
        Self {
            code: code.into(),
            detail: detail.to_string(),
            params: None,
        }
    }
    pub fn with_params<const N: usize>(mut self, params: [(&str, &str); N]) -> Self {
        self.params = Some(
            params
                .into_iter()
                .map(|(key, value)| (key.into(), value.into()))
                .collect(),
        );
        self
    }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::new("io", e)
    }
}
impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        Self::new("database", e)
    }
}
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Fingerprint {
    pub identity: String,
    pub size: u64,
    pub modified: String,
}
pub fn fingerprint(path: &Path) -> Result<Fingerprint> {
    let m = std::fs::symlink_metadata(path)?;
    let identity = format!("{:?}", file_id::get_file_id(path)?);
    Ok(Fingerprint {
        identity,
        size: m.len(),
        modified: m
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_string(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: String,
    pub path: String,
    pub name: String,
    pub kind: String,
    pub fingerprint: Option<Fingerprint>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub mode: String,
    pub index: usize,
    pub from_end: bool,
    pub marker: String,
    pub occurrence: usize,
}
impl Default for Position {
    fn default() -> Self {
        Self {
            mode: "suffix".into(),
            index: 1,
            from_end: false,
            marker: String::new(),
            occurrence: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub mode: String,
    pub index: usize,
    pub length: usize,
    pub from_end: bool,
    pub marker: String,
    pub right: String,
    pub occurrence: usize,
    pub include: bool,
}
impl Default for Selection {
    fn default() -> Self {
        Self {
            mode: "range".into(),
            index: 1,
            length: 1,
            from_end: false,
            marker: String::new(),
            right: String::new(),
            occurrence: 1,
            include: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NumberStyle {
    #[default]
    Numeric,
    Upper,
    Lower,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RuleConfig {
    Add {
        text: String,
        pad: bool,
        width: usize,
        position: Position,
    },
    Replace {
        find: String,
        replacement: String,
        regex: bool,
        sensitive: bool,
        occurrence: usize,
    },
    Remove {
        mode: String,
        keep: bool,
        selection: Selection,
        text: String,
        category: String,
    },
    Number {
        #[serde(default)]
        style: NumberStyle,
        start: i64,
        step: u64,
        width: usize,
        fill: String,
        #[serde(rename = "perDirectory")]
        per_directory: bool,
        position: Position,
    },
    Move {
        selection: Selection,
        distance: usize,
        left: bool,
    },
    Case {
        mode: String,
        delimiters: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRule {
    pub id: String,
    pub enabled: bool,
    pub scope: String,
    pub config: RuleConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRow {
    pub id: String,
    pub original_path: String,
    pub target_path: String,
    pub original_name: String,
    pub new_name: String,
    pub kind: String,
    pub selected: bool,
    pub status: String,
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_params: Option<std::collections::HashMap<String, String>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePlan {
    pub id: String,
    pub revision: u64,
    pub rows: Vec<PreviewRow>,
    pub changes: usize,
    pub conflicts: usize,
}
#[derive(Debug, Clone)]
pub struct StoredPlan {
    pub preview: RenamePlan,
    pub entries: Vec<FileEntry>,
    pub rules: Vec<RenameRule>,
    pub selected: Vec<String>,
    pub templates: Vec<Option<crate::template::Template>>,
    pub snapshot: crate::template::TemplateSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub created: i64,
    pub status: String,
    pub count: usize,
    pub detail: String,
    pub pending_paths: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: String,
    pub done: usize,
    pub total: usize,
}
