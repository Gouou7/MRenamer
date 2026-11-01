use crate::model::*;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

/// Keep the existing journal when upgrading from the original application identifier.
pub fn history_path(data_dir: &Path) -> PathBuf {
    let current = data_dir.join("history.sqlite3");
    let legacy = data_dir
        .parent()
        .map(|parent| parent.join("app.renamer.desktop/history.sqlite3"));
    if !current.exists() {
        if let Some(legacy) = legacy.filter(|path| path.is_file()) {
            return legacy;
        }
    }
    current
}

pub struct Journal {
    pub db: Connection,
}
#[derive(Debug, Clone)]
pub struct Step {
    pub seq: i64,
    pub from: String,
    pub to: String,
    pub identity: String,
    pub state: String,
}
impl Journal {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path)?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,created INTEGER NOT NULL,status TEXT NOT NULL,count INTEGER NOT NULL,detail TEXT NOT NULL DEFAULT '');
          CREATE TABLE IF NOT EXISTS steps(operation TEXT NOT NULL,seq INTEGER NOT NULL,source TEXT NOT NULL,target TEXT NOT NULL,identity TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(operation,seq));")?;
        db.execute(
            "UPDATE operations SET status='recoveryNeeded' WHERE status IN ('running','undoing')",
            [],
        )?;
        Ok(Self { db })
    }
    pub fn create(&self, id: &str, count: usize) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        self.db.execute(
            "INSERT INTO operations(id,created,status,count) VALUES (?1,?2,'running',?3)",
            params![id, now, count as i64],
        )?;
        Ok(())
    }
    pub fn status(&self, id: &str, status: &str, detail: &str) -> Result<()> {
        self.db.execute(
            "UPDATE operations SET status=?2,detail=?3 WHERE id=?1",
            params![id, status, detail],
        )?;
        Ok(())
    }
    pub fn prepare(&self, id: &str, seq: i64, from: &str, to: &str, identity: &str) -> Result<()> {
        self.db.execute(
            "INSERT INTO steps VALUES (?1,?2,?3,?4,?5,'pending')",
            params![id, seq, from, to, identity],
        )?;
        Ok(())
    }
    pub fn step_state(&self, id: &str, seq: i64, state: &str) -> Result<()> {
        self.db.execute(
            "UPDATE steps SET state=?3 WHERE operation=?1 AND seq=?2",
            params![id, seq, state],
        )?;
        Ok(())
    }
    pub fn steps(&self, id: &str) -> Result<Vec<Step>> {
        let mut st=self.db.prepare("SELECT seq,source,target,identity,state FROM steps WHERE operation=?1 ORDER BY seq DESC")?;
        let values = st
            .query_map([id], |r| {
                Ok(Step {
                    seq: r.get(0)?,
                    from: r.get(1)?,
                    to: r.get(2)?,
                    identity: r.get(3)?,
                    state: r.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(values)
    }
    pub fn clear_history(&self, operation_id: Option<&str>) -> Result<()> {
        let transaction = self.db.unchecked_transaction()?;
        if let Some(id) = operation_id {
            let protected: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM operations WHERE id=?1 AND status NOT IN ('completed','undone','rolledBack'))",
                [id],
                |row| row.get(0),
            )?;
            if protected {
                return Err(AppError::new("historyProtected", ""));
            }
        }
        transaction.execute(
            "DELETE FROM steps WHERE operation IN (SELECT id FROM operations WHERE status IN ('completed','undone','rolledBack') AND (?1 IS NULL OR id=?1))",
            params![operation_id],
        )?;
        transaction.execute(
            "DELETE FROM operations WHERE status IN ('completed','undone','rolledBack') AND (?1 IS NULL OR id=?1)",
            params![operation_id],
        )?;
        transaction.commit()?;
        Ok(())
    }
    pub fn history(&self) -> Result<Vec<HistoryEntry>> {
        let mut st=self.db.prepare("SELECT id,created,status,count,detail FROM operations ORDER BY created DESC,rowid DESC")?;
        let mut values = st
            .query_map([], |r| {
                Ok(HistoryEntry {
                    id: r.get(0)?,
                    created: r.get(1)?,
                    status: r.get(2)?,
                    count: r.get::<_, i64>(3)? as usize,
                    detail: r.get(4)?,
                    pending_paths: Vec::new(),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for operation in &mut values {
            if operation.status != "recoveryNeeded" {
                continue;
            }
            let mut paths: Vec<(String, std::path::PathBuf)> = Vec::new();
            for step in self
                .steps(&operation.id)?
                .into_iter()
                .rev()
                .filter(|s| s.state != "undone")
            {
                let from = std::path::PathBuf::from(&step.from);
                let to = std::path::PathBuf::from(&step.to);
                if step.state == "pending"
                    && !fingerprint(&to).is_ok_and(|f| f.identity == step.identity)
                {
                    continue;
                }
                if !paths.iter().any(|(_, path)| *path == from) {
                    paths.push((step.identity.clone(), from.clone()));
                }
                for (_, path) in &mut paths {
                    if let Ok(rest) = path.strip_prefix(&from) {
                        *path = if rest.as_os_str().is_empty() {
                            to.clone()
                        } else {
                            to.join(rest)
                        };
                    }
                }
            }
            operation.pending_paths = paths
                .into_iter()
                .map(|(_, p)| p.to_string_lossy().into_owned())
                .collect();
            operation.pending_paths.sort();
            operation.pending_paths.dedup();
        }
        Ok(values)
    }
}
