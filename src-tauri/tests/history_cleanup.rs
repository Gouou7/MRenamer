use renamer_lib::storage::Journal;

fn add(journal: &Journal, id: &str, status: &str) {
    journal.create(id, 1).unwrap();
    journal
        .prepare(id, 0, "source", "target", "identity")
        .unwrap();
    journal.step_state(id, 0, "applied").unwrap();
    journal.status(id, status, "detail").unwrap();
}

#[test]
fn clearing_one_record_removes_its_steps_and_persists_after_restart() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("journal.db");
    let journal = Journal::open(&path).unwrap();
    add(&journal, "first", "completed");
    add(&journal, "second", "completed");
    journal.clear_history(Some("first")).unwrap();
    journal.clear_history(Some("first")).unwrap();
    assert!(journal.steps("first").unwrap().is_empty());
    assert_eq!(journal.steps("second").unwrap().len(), 1);
    drop(journal);
    let journal = Journal::open(&path).unwrap();
    let history = journal.history().unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, "second");
}

#[test]
fn clearing_all_keeps_unfinished_and_unknown_records_and_their_steps() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("journal.db");
    let journal = Journal::open(&path).unwrap();
    for status in [
        "completed",
        "undone",
        "rolledBack",
        "running",
        "undoing",
        "recoveryNeeded",
        "futureStatus",
    ] {
        add(&journal, status, status);
    }
    for status in ["running", "undoing", "recoveryNeeded", "futureStatus"] {
        let error = journal.clear_history(Some(status)).unwrap_err();
        assert_eq!(error.code, "historyProtected");
        assert_eq!(journal.steps(status).unwrap().len(), 1);
    }
    journal.clear_history(None).unwrap();
    journal.clear_history(None).unwrap();
    assert_eq!(journal.history().unwrap().len(), 4);
    for status in ["completed", "undone", "rolledBack"] {
        assert!(journal.steps(status).unwrap().is_empty());
    }
    drop(journal);
    let journal = Journal::open(&path).unwrap();
    for entry in journal.history().unwrap() {
        assert_eq!(journal.steps(&entry.id).unwrap().len(), 1);
        assert!(entry.status == "recoveryNeeded" || entry.status == "futureStatus");
    }
}

#[test]
fn failed_cleanup_rolls_back_step_deletion() {
    let root = tempfile::tempdir().unwrap();
    let journal = Journal::open(&root.path().join("journal.db")).unwrap();
    add(&journal, "record", "completed");
    journal.db.execute_batch("CREATE TRIGGER block_cleanup BEFORE DELETE ON operations BEGIN SELECT RAISE(ABORT, 'fixture'); END;").unwrap();
    assert!(journal.clear_history(None).is_err());
    assert_eq!(journal.history().unwrap().len(), 1);
    assert_eq!(journal.steps("record").unwrap().len(), 1);
}
