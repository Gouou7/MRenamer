use renamer_lib::{engine::Engine, model::*, platform};
use std::{fs, path::Path};
use tempfile::tempdir;

#[test]
fn hardlink_target_outside_the_batch_is_a_conflict() {
    let t = tempdir().unwrap();
    let a = t.path().join("a.txt");
    let target = t.path().join("new_a.txt");
    fs::write(&a, "content").unwrap();
    fs::hard_link(&a, &target).unwrap();
    let mut e = Engine::open(&t.path().join("j.db")).unwrap();
    let entries = load(&mut e, &a, false);
    let ids = entries.iter().map(|v| v.id.clone()).collect::<Vec<_>>();
    let plan = e.preview(ids.clone(), ids, vec![add("new_")], 0).unwrap();
    assert_eq!(plan.conflicts, 1);
    assert!(e.execute(&plan.id, &noop).is_err());
    assert!(a.exists());
    assert_eq!(fs::read_to_string(target).unwrap(), "content");
}

#[cfg(windows)]
#[test]
fn locked_source_does_not_leave_staged_names() {
    use std::os::windows::fs::OpenOptionsExt;
    let t = tempdir().unwrap();
    let a = t.path().join("a.txt");
    let b = t.path().join("b.txt");
    fs::write(&a, "A").unwrap();
    fs::write(&b, "B").unwrap();
    let mut e = Engine::open(&t.path().join("j.db")).unwrap();
    let entries = e
        .scan(
            vec![a.to_str().unwrap().into(), b.to_str().unwrap().into()],
            false,
            false,
            &noop,
        )
        .unwrap();
    let ids = entries.iter().map(|v| v.id.clone()).collect::<Vec<_>>();
    let p = e.preview(ids.clone(), ids, vec![add("new_")], 0).unwrap();
    let locked = fs::OpenOptions::new()
        .read(true)
        .share_mode(3)
        .open(&b)
        .unwrap();
    assert!(e.execute(&p.id, &noop).is_err());
    drop(locked);
    assert_eq!(fs::read_to_string(&a).unwrap(), "A");
    assert_eq!(fs::read_to_string(&b).unwrap(), "B");
    assert!(!t.path().join("new_a.txt").exists());
    assert!(!fs::read_dir(t.path())
        .unwrap()
        .flatten()
        .any(|entry| entry.file_name().to_string_lossy().starts_with(".renamer-")));
}

#[cfg(unix)]
#[test]
fn links_and_link_ancestors_are_not_scanned() {
    use std::os::unix::fs::symlink;
    let t = tempdir().unwrap();
    let real = t.path().join("real");
    fs::create_dir(&real).unwrap();
    fs::write(real.join("a"), "content").unwrap();
    let link = t.path().join("alias");
    symlink(&real, &link).unwrap();
    let mut e = Engine::open(&t.path().join("j.db")).unwrap();
    let entries = load(&mut e, &link, true);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].kind, "link");
    let entries = load(&mut e, &link.join("a"), true);
    assert_eq!(entries[0].kind, "link");
}
fn noop(_: Progress) {}

#[test]
fn clearing_history_keeps_files_and_other_operations_undoable_after_restart() {
    let t = tempdir().unwrap();
    let a = t.path().join("a.txt");
    let b = t.path().join("b.txt");
    fs::write(&a, "A").unwrap();
    fs::write(&b, "B").unwrap();
    let path = t.path().join("journal.db");
    let mut engine = Engine::open(&path).unwrap();
    let entries = load(&mut engine, &a, false);
    let first = execute(&mut engine, &entries, vec![add("new_")]);
    let entries = load(&mut engine, &b, false);
    let second = execute(&mut engine, &entries, vec![add("new_")]);
    engine.journal.clear_history(Some(&first.id)).unwrap();
    drop(engine);
    let mut engine = Engine::open(&path).unwrap();
    assert_eq!(fs::read_to_string(t.path().join("new_a.txt")).unwrap(), "A");
    assert_eq!(fs::read_to_string(t.path().join("new_b.txt")).unwrap(), "B");
    engine.undo(&second.id, &noop).unwrap();
    assert_eq!(fs::read_to_string(&b).unwrap(), "B");
    assert_eq!(fs::read_to_string(t.path().join("new_a.txt")).unwrap(), "A");
    assert!(engine.journal.steps(&first.id).unwrap().is_empty());
}

#[test]
fn folder_contents_respects_kind_and_recursion_preferences() {
    let t = tempdir().unwrap();
    let root = t.path().join("objects");
    fs::create_dir_all(root.join("sub/nested")).unwrap();
    fs::write(root.join("a.txt"), "A").unwrap();
    fs::write(root.join("sub/b.txt"), "B").unwrap();
    fs::write(root.join("sub/nested/c.txt"), "C").unwrap();
    let mut e = Engine::open(&t.path().join("journal.db")).unwrap();
    for (files, folders, recursive, expected) in [
        (true, true, false, vec!["a.txt", "sub"]),
        (true, false, false, vec!["a.txt"]),
        (false, true, false, vec!["sub"]),
        (true, false, true, vec!["a.txt", "b.txt", "c.txt"]),
        (false, true, true, vec!["nested", "sub"]),
        (
            true,
            true,
            true,
            vec!["a.txt", "b.txt", "c.txt", "nested", "sub"],
        ),
        (false, false, true, vec![]),
    ] {
        let entries = e
            .scan_folder_contents(
                vec![root.to_str().unwrap().into(), root.to_str().unwrap().into()],
                files,
                folders,
                recursive,
                &noop,
            )
            .unwrap();
        let mut names: Vec<_> = entries.iter().map(|entry| entry.name.as_str()).collect();
        names.sort();
        assert_eq!(names, expected);
        let ids: Vec<_> = entries.iter().map(|entry| entry.id.clone()).collect();
        let plan = e.preview(ids.clone(), ids, vec![], 0).unwrap();
        assert_eq!(plan.rows.len(), expected.len());
    }
    let entries = e
        .scan(vec![root.to_str().unwrap().into()], false, false, &noop)
        .unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "objects");
}

#[cfg(windows)]
#[test]
fn folder_contents_does_not_follow_junctions_or_link_ancestors() {
    let t = tempdir().unwrap();
    let root = t.path().join("objects");
    let outside = t.path().join("outside");
    fs::create_dir(&root).unwrap();
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("secret.txt"), "content").unwrap();
    let junction = root.join("junction");
    let output = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(&junction)
        .arg(&outside)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let mut e = Engine::open(&t.path().join("journal.db")).unwrap();
    let entries = e
        .scan_folder_contents(
            vec![root.to_str().unwrap().into()],
            true,
            false,
            true,
            &noop,
        )
        .unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].kind, "link");
    assert_eq!(entries[0].error.as_deref(), Some("unsupportedLink"));
    let error = e
        .scan_folder_contents(
            vec![junction.to_str().unwrap().into()],
            true,
            true,
            true,
            &noop,
        )
        .unwrap_err();
    assert_eq!(error.code, "unsupportedLink");
}

#[test]
fn alphabetic_preview_matches_execution_and_undo_after_restart() {
    for (style, names) in [
        (NumberStyle::Upper, ["Za.txt", "AA子目录"]),
        (NumberStyle::Lower, ["za.txt", "aa子目录"]),
    ] {
        let t = tempdir().unwrap();
        fs::write(t.path().join("a.txt"), "file content").unwrap();
        fs::create_dir(t.path().join("子目录")).unwrap();
        fs::write(t.path().join("子目录/child.txt"), "child content").unwrap();
        let db = t.path().join("journal.db");
        let mut engine = Engine::open(&db).unwrap();
        let entries = engine
            .scan(
                ["a.txt", "子目录"]
                    .map(|name| t.path().join(name).to_str().unwrap().into())
                    .to_vec(),
                false,
                false,
                &noop,
            )
            .unwrap();
        let ids = entries
            .iter()
            .map(|entry| entry.id.clone())
            .collect::<Vec<_>>();
        let rule = RenameRule {
            id: "letters".into(),
            enabled: true,
            scope: "stem".into(),
            config: RuleConfig::Number {
                style,
                start: 26,
                step: 1,
                width: 3,
                fill: "0".into(),
                per_directory: false,
                position: Position {
                    mode: "prefix".into(),
                    ..Default::default()
                },
            },
        };
        let plan = engine.preview(ids.clone(), ids, vec![rule], 0).unwrap();
        assert_eq!(plan.conflicts, 0);
        assert_eq!(plan.rows[0].new_name, names[0]);
        assert_eq!(plan.rows[1].new_name, names[1]);
        let op = engine.execute(&plan.id, &noop).unwrap();
        assert_eq!(
            fs::read_to_string(t.path().join(names[0])).unwrap(),
            "file content"
        );
        assert_eq!(
            fs::read_to_string(t.path().join(names[1]).join("child.txt")).unwrap(),
            "child content"
        );
        drop(engine);
        let mut engine = Engine::open(&db).unwrap();
        engine.undo(&op.id, &noop).unwrap();
        assert_eq!(
            fs::read_to_string(t.path().join("a.txt")).unwrap(),
            "file content"
        );
        assert_eq!(
            fs::read_to_string(t.path().join("子目录/child.txt")).unwrap(),
            "child content"
        );
        assert!(!t.path().join(names[0]).exists());
        assert!(!t.path().join(names[1]).exists());
    }
}

fn add(text: &str) -> RenameRule {
    RenameRule {
        id: "add".into(),
        enabled: true,
        scope: "stem".into(),
        config: RuleConfig::Add {
            text: text.into(),
            pad: false,
            width: 8,
            position: Position {
                mode: "prefix".into(),
                ..Default::default()
            },
        },
    }
}
fn load(e: &mut Engine, p: &Path, recursive: bool) -> Vec<FileEntry> {
    e.scan(
        vec![p.to_str().unwrap().into()],
        recursive,
        recursive,
        &noop,
    )
    .unwrap()
}
fn execute(e: &mut Engine, entries: &[FileEntry], rules: Vec<RenameRule>) -> HistoryEntry {
    let ids = entries.iter().map(|x| x.id.clone()).collect::<Vec<_>>();
    let plan = e.preview(ids.clone(), ids, rules, 1).unwrap();
    assert_eq!(plan.conflicts, 0, "{:?}", plan);
    e.execute(&plan.id, &noop).unwrap()
}
#[test]
fn rename_nested_and_undo_after_restart() {
    let t = tempdir().unwrap();
    let root = t.path().join("folder");
    fs::create_dir_all(root.join("child")).unwrap();
    fs::write(root.join("child/file.txt"), "payload").unwrap();
    let db = t.path().join("journal.db");
    let mut e = Engine::open(&db).unwrap();
    let entries = load(&mut e, &root, true);
    let op = execute(&mut e, &entries, vec![add("new_")]);
    assert_eq!(
        fs::read_to_string(t.path().join("new_folder/new_child/new_file.txt")).unwrap(),
        "payload"
    );
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    e.undo(&op.id, &noop).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("child/file.txt")).unwrap(),
        "payload"
    );
}
#[test]
fn exchange_names_and_case_only() {
    let t = tempdir().unwrap();
    let a = t.path().join("ab.txt");
    let b = t.path().join("ba.txt");
    fs::write(&a, "A").unwrap();
    fs::write(&b, "B").unwrap();
    let mut e = Engine::open(&t.path().join("j.db")).unwrap();
    let entries = e
        .scan(
            vec![a.to_str().unwrap().into(), b.to_str().unwrap().into()],
            false,
            false,
            &noop,
        )
        .unwrap();
    let movement = RenameRule {
        id: "move".into(),
        enabled: true,
        scope: "stem".into(),
        config: RuleConfig::Move {
            selection: Default::default(),
            distance: 1,
            left: false,
        },
    };
    let op = execute(&mut e, &entries, vec![movement]);
    assert_eq!(fs::read_to_string(&a).unwrap(), "B");
    assert_eq!(fs::read_to_string(&b).unwrap(), "A");
    e.undo(&op.id, &noop).unwrap();
    let entries = load(&mut e, &a, false);
    let case = RenameRule {
        id: "case".into(),
        enabled: true,
        scope: "stem".into(),
        config: RuleConfig::Case {
            mode: "upper".into(),
            delimiters: " ".into(),
        },
    };
    let op = execute(&mut e, &entries, vec![case]);
    assert!(t.path().join("AB.txt").exists());
    e.undo(&op.id, &noop).unwrap();
    assert_eq!(fs::read_to_string(&a).unwrap(), "A");
}
#[test]
fn conflicts_and_stale_preview_do_not_touch_files() {
    let t = tempdir().unwrap();
    let a = t.path().join("a.txt");
    let b = t.path().join("new_a.txt");
    fs::write(&a, "A").unwrap();
    fs::write(&b, "B").unwrap();
    let mut e = Engine::open(&t.path().join("j.db")).unwrap();
    let entries = load(&mut e, &a, false);
    let ids = entries.iter().map(|x| x.id.clone()).collect::<Vec<_>>();
    let p = e
        .preview(ids.clone(), ids.clone(), vec![add("new_")], 1)
        .unwrap();
    assert_eq!(p.conflicts, 1);
    assert!(e.execute(&p.id, &noop).is_err());
    assert_eq!(fs::read_to_string(&b).unwrap(), "B");
    let p = e.preview(ids.clone(), ids, vec![add("ok_")], 2).unwrap();
    fs::write(&a, "changed").unwrap();
    assert!(e.execute(&p.id, &noop).is_err());
    assert!(!t.path().join("ok_a.txt").exists());
}
#[test]
fn undo_collision_is_preflighted() {
    let t = tempdir().unwrap();
    let a = t.path().join("a.txt");
    fs::write(&a, "A").unwrap();
    let mut e = Engine::open(&t.path().join("j.db")).unwrap();
    let entries = load(&mut e, &a, false);
    let op = execute(&mut e, &entries, vec![add("new_")]);
    fs::write(&a, "B").unwrap();
    assert!(e.undo(&op.id, &noop).is_err());
    assert_eq!(fs::read_to_string(&a).unwrap(), "B");
    assert_eq!(fs::read_to_string(t.path().join("new_a.txt")).unwrap(), "A");
}
#[test]
fn interrupted_pending_step_can_be_recovered() {
    let t = tempdir().unwrap();
    let a = t.path().join("a");
    let b = t.path().join("b");
    fs::write(&a, "content").unwrap();
    let db = t.path().join("j.db");
    let e = Engine::open(&db).unwrap();
    let identity = fingerprint(&a).unwrap().identity;
    e.journal.create("interrupted", 1).unwrap();
    e.journal
        .prepare(
            "interrupted",
            0,
            a.to_str().unwrap(),
            b.to_str().unwrap(),
            &identity,
        )
        .unwrap();
    platform::rename_no_replace(&a, &b).unwrap();
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    assert_eq!(e.journal.history().unwrap()[0].status, "recoveryNeeded");
    assert_eq!(
        e.journal.history().unwrap()[0].pending_paths,
        vec![b.to_str().unwrap().to_string()]
    );
    e.undo("interrupted", &noop).unwrap();
    assert_eq!(fs::read_to_string(&a).unwrap(), "content");
}
#[test]
fn platform_never_overwrites_existing_target() {
    let t = tempdir().unwrap();
    let a = t.path().join("a");
    let b = t.path().join("b");
    fs::write(&a, "A").unwrap();
    fs::write(&b, "B").unwrap();
    assert!(platform::rename_no_replace(&a, &b).is_err());
    assert_eq!(fs::read_to_string(&b).unwrap(), "B");
}

#[test]
fn failure_after_first_final_move_rolls_back_without_overwriting() {
    let t = tempdir().unwrap();
    let a = t.path().join("a.txt");
    let b = t.path().join("b.txt");
    fs::write(&a, "A").unwrap();
    fs::write(&b, "B").unwrap();
    let mut e = Engine::open(&t.path().join("j.db")).unwrap();
    let entries = e
        .scan(
            vec![a.to_str().unwrap().into(), b.to_str().unwrap().into()],
            false,
            false,
            &noop,
        )
        .unwrap();
    let ids = entries.iter().map(|r| r.id.clone()).collect::<Vec<_>>();
    let p = e.preview(ids.clone(), ids, vec![add("new_")], 0).unwrap();
    let created = std::cell::Cell::new(false);
    let occupied = t.path().join("new_b.txt");
    let result = e.execute(&p.id, &|progress| {
        if progress.done == 1 && !created.replace(true) {
            fs::write(&occupied, "external").unwrap();
        }
    });
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "rolledBack");
    assert_eq!(fs::read_to_string(a).unwrap(), "A");
    assert_eq!(fs::read_to_string(b).unwrap(), "B");
    assert_eq!(fs::read_to_string(occupied).unwrap(), "external");
    assert_eq!(e.journal.history().unwrap()[0].status, "rolledBack");
}
