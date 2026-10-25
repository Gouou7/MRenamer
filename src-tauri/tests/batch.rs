use renamer_lib::{engine::calculate, model::*};
use std::path::Path;
fn numbered(per_directory: bool) -> RenameRule {
    RenameRule {
        id: "number".into(),
        enabled: true,
        scope: "stem".into(),
        config: RuleConfig::Number {
            start: 1,
            step: 1,
            width: 3,
            fill: "0".into(),
            per_directory,
            position: Position {
                mode: "prefix".into(),
                ..Default::default()
            },
        },
    }
}
fn entry(root: &Path, name: &str) -> FileEntry {
    let path = root.join(name).to_str().unwrap().to_owned();
    FileEntry {
        id: path.clone(),
        path,
        name: Path::new(name)
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .into(),
        kind: "file".into(),
        fingerprint: None,
        error: None,
    }
}
#[test]
fn ten_thousand_rows_are_numbered_in_input_order() {
    let temp = tempfile::tempdir().unwrap();
    let entries = (0..10000)
        .map(|i| entry(temp.path(), &format!("图像{i}.png")))
        .collect::<Vec<_>>();
    let ids = entries.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let started = std::time::Instant::now();
    let plan = calculate(&entries, &ids, &[numbered(false)], 17).unwrap();
    assert_eq!(plan.changes, 10000);
    assert_eq!(plan.conflicts, 0);
    assert_eq!(plan.rows[0].new_name, "001图像0.png");
    assert_eq!(plan.rows[9999].new_name, "10000图像9999.png");
    println!("10000-row Rust preview: {:?}", started.elapsed());
}
#[test]
fn per_directory_numbering_and_unselected_rows() {
    let temp = tempfile::tempdir().unwrap();
    let entries = [
        entry(temp.path(), "a/one.png"),
        entry(temp.path(), "a/skip.png"),
        entry(temp.path(), "b/one.png"),
        entry(temp.path(), "a/two.png"),
    ];
    let ids = vec![
        entries[0].id.clone(),
        entries[2].id.clone(),
        entries[3].id.clone(),
    ];
    let plan = calculate(&entries, &ids, &[numbered(true)], 0).unwrap();
    assert_eq!(plan.rows[0].new_name, "001one.png");
    assert_eq!(plan.rows[1].new_name, "skip.png");
    assert_eq!(plan.rows[2].new_name, "001one.png");
    assert_eq!(plan.rows[3].new_name, "002two.png");
}
#[test]
fn clearing_then_numbering_is_valid_but_final_empty_is_not() {
    let temp = tempfile::tempdir().unwrap();
    let e = entry(temp.path(), "one.txt");
    let ids = vec![e.id.clone()];
    let clear = RenameRule {
        id: "clear".into(),
        enabled: true,
        scope: "stem".into(),
        config: RuleConfig::Remove {
            mode: "clear".into(),
            keep: false,
            selection: Default::default(),
            text: String::new(),
            category: "digits".into(),
        },
    };
    let plan = calculate(&[e.clone()], &ids, &[clear.clone(), numbered(false)], 0).unwrap();
    assert_eq!(plan.rows[0].new_name, "001.txt");
    assert_eq!(plan.conflicts, 0);
    let clear_full = RenameRule {
        scope: "full".into(),
        ..clear
    };
    let plan = calculate(&[e], &ids, &[clear_full], 0).unwrap();
    assert_eq!(plan.conflicts, 1);
}
