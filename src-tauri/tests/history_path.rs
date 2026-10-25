use renamer_lib::{
    engine::Engine,
    storage::{history_path, Journal},
};
use std::fs;

#[test]
fn keeps_legacy_history_without_replacing_current_history() {
    let root = tempfile::tempdir().unwrap();
    let current_dir = root.path().join("dev.govo.mrenamer");
    let legacy_dir = root.path().join("app.renamer.desktop");
    fs::create_dir_all(&current_dir).unwrap();
    fs::create_dir_all(&legacy_dir).unwrap();
    let current = current_dir.join("history.sqlite3");
    let legacy = legacy_dir.join("history.sqlite3");
    assert_eq!(history_path(&current_dir), current);
    fs::write(&legacy, b"existing history").unwrap();
    assert_eq!(history_path(&current_dir), legacy);
    assert!(!current.exists());
    fs::write(&current, b"current history").unwrap();
    assert_eq!(history_path(&current_dir), current);
    assert_eq!(fs::read(&legacy).unwrap(), b"existing history");
}

#[test]
fn upgraded_engine_reads_existing_operation_history() {
    let root = tempfile::tempdir().unwrap();
    let current_dir = root.path().join("dev.govo.mrenamer");
    let legacy_dir = root.path().join("app.renamer.desktop");
    fs::create_dir_all(&current_dir).unwrap();
    fs::create_dir_all(&legacy_dir).unwrap();
    {
        let journal = Journal::open(&legacy_dir.join("history.sqlite3")).unwrap();
        journal.create("previous-operation", 3).unwrap();
        journal
            .status("previous-operation", "completed", "")
            .unwrap();
    }
    let engine = Engine::open(&history_path(&current_dir)).unwrap();
    let records = engine.journal.history().unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].id, "previous-operation");
    assert_eq!(records[0].count, 3);
    assert_eq!(records[0].status, "completed");
    assert!(!current_dir.join("history.sqlite3").exists());
}
