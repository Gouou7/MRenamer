use chrono::DateTime;
use renamer_lib::{
    engine::{calculate_with_context, Engine},
    model::*,
    template::*,
};
use std::{collections::HashMap, fs, path::Path};

fn snapshot(time: &str) -> TemplateSnapshot {
    TemplateSnapshot {
        now: DateTime::parse_from_rfc3339(time).unwrap(),
        files: HashMap::new(),
    }
}
fn entry(name: &str) -> FileEntry {
    FileEntry {
        id: name.into(),
        path: Path::new("root")
            .join("data/work/archive/projects/photos")
            .join(name)
            .to_str()
            .unwrap()
            .into(),
        name: name.into(),
        kind: "file".into(),
        fingerprint: None,
        error: None,
    }
}
fn add(text: &str) -> RenameRule {
    RenameRule {
        id: "template".into(),
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
fn render(
    input: &str,
    entry: &FileEntry,
    current_name: &str,
    snapshot: &TemplateSnapshot,
) -> Result<String> {
    Template::parse(input)?
        .expand(&Context {
            entry,
            current_name,
            snapshot,
        })
        .map(|v| v.render(None))
}

#[test]
fn catalog_and_parser_cover_every_variable_and_escape_once() {
    let e = entry("report.tar.gz");
    let mut context = snapshot("2000-01-02T03:04:05+08:00");
    context.files.insert(
        e.id.clone(),
        FileTimes {
            created: Some(context.now),
            modified: Some(context.now),
        },
    );
    assert_eq!(variables().len(), 23);
    let mut unique = std::collections::HashSet::new();
    for variable in variables() {
        assert!(unique.insert(variable.name.to_lowercase()));
        assert!(!render(
            &format!("<{}>", variable.name.to_lowercase()),
            &e,
            "CURRENT.TXT",
            &context
        )
        .unwrap()
        .is_empty());
    }
    assert_eq!(
        render("<dAtE><TIME>_<<Date>>_<<<<", &e, "CURRENT.TXT", &context).unwrap(),
        "2000-01-0203-04-05_<Date>_<<"
    );
    assert_eq!(
        render("<DateTime>_<Year><Month><Day>", &e, "", &context).unwrap(),
        "2000-01-02_03-04-05_20000102"
    );
    let mut named = entry("<Date>$1.txt");
    named.kind = "directory".into();
    assert_eq!(
        render("<Name>", &named, "", &context).unwrap(),
        "<Date>$1.txt"
    );
    for value in ["<", ">", "<Date", "<Date<Time>>", "<>", "<Date Time>"] {
        assert_eq!(
            Template::parse(value).unwrap_err().detail,
            "templateSyntax",
            "{value}"
        );
    }
    let error = Template::parse("<NotAVariable>").unwrap_err();
    assert_eq!(error.detail, "unknownVariable");
    assert_eq!(error.params.unwrap()["variable"], "NotAVariable");
}

#[test]
fn names_have_original_and_per_rule_current_values_across_scopes() {
    let e = entry("photo.tar.jpg");
    let context = snapshot("2000-01-01T00:00:00+08:00");
    let upper = RenameRule {
        id: "upper".into(),
        enabled: true,
        scope: "full".into(),
        config: RuleConfig::Case {
            mode: "upper".into(),
            delimiters: "".into(),
        },
    };
    let replace = RenameRule {
        id: "replace".into(),
        enabled: true,
        scope: "full".into(),
        config: RuleConfig::Replace {
            find: "^.*$".into(),
            replacement: "<Name>_<CName>_<Stem>_<CStem>_<Ext>_<CExt>".into(),
            regex: true,
            sensitive: true,
            occurrence: 0,
        },
    };
    let plan = calculate_with_context(
        &[e.clone()],
        std::slice::from_ref(&e.id),
        &[upper, replace],
        1,
        &context,
    )
    .unwrap();
    assert_eq!(
        plan.rows[0].new_name,
        "photo.tar.jpg_PHOTO.TAR.JPG_photo.tar_PHOTO.TAR_jpg_JPG"
    );
    let mut rule = add("<CName>_<CName>_");
    rule.scope = "extension".into();
    let plan = calculate_with_context(
        &[e.clone()],
        std::slice::from_ref(&e.id),
        &[rule],
        1,
        &context,
    )
    .unwrap();
    assert_eq!(
        plan.rows[0].new_name,
        "photo.tar.photo.tar.jpg_photo.tar.jpg_jpg"
    );
    for (name, stem, ext) in [
        (".env", ".env", ""),
        ("plain", "plain", ""),
        ("a.tar.gz", "a.tar", "gz"),
        ("name.", "name", ""),
    ] {
        let e = entry(name);
        assert_eq!(
            render("<Stem>_<Ext>", &e, name, &context).unwrap(),
            format!("{stem}_{ext}")
        );
    }
    let mut dir = entry("folder.with.dot");
    dir.kind = "directory".into();
    assert_eq!(
        render("<Stem>_<Ext>_<CStem>_<CExt>", &dir, "current.dir", &context).unwrap(),
        "folder.with.dot__current.dir_"
    );
}

#[test]
fn parents_come_from_original_path_and_root_is_not_a_directory_name() {
    let e = entry("image.png");
    let context = snapshot("2000-01-01T00:00:00+08:00");
    assert_eq!(
        render(
            "<ParentDir>_<ParentDir2>_<ParentDir3>_<ParentDir4>_<ParentDir5>",
            &e,
            "",
            &context
        )
        .unwrap(),
        "photos_projects_archive_work_data"
    );
    let mut root = entry("a");
    root.path = if cfg!(windows) {
        "C:\\a".into()
    } else {
        "/a".into()
    };
    let error = render("<ParentDir>", &root, "", &context).unwrap_err();
    assert_eq!(error.code, "variableUnavailable");
    assert_eq!(error.params.unwrap()["reason"], "parentMissing");
}

#[test]
fn missing_file_times_are_row_errors_only_when_used_and_selected() {
    let entries = [entry("missing.txt"), entry("present.txt")];
    let mut context = snapshot("2000-01-01T00:00:00+08:00");
    context.files.insert(
        entries[1].id.clone(),
        FileTimes {
            created: Some(context.now),
            modified: Some(context.now),
        },
    );
    let ids = entries.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let mut after = add("after_");
    after.id = "after".into();
    let plan = calculate_with_context(&entries, &ids, &[add("<CreatedDate>_"), after], 0, &context)
        .unwrap();
    assert_eq!(plan.conflicts, 1);
    assert_eq!(plan.rows[0].new_name, "missing.txt");
    assert_eq!(
        plan.rows[0].error_params.as_ref().unwrap()["variable"],
        "CreatedDate"
    );
    assert_eq!(plan.rows[1].new_name, "after_2000-01-01_present.txt");
    let plan =
        calculate_with_context(&entries, &ids[1..], &[add("<CreatedDate>_")], 0, &context).unwrap();
    assert_eq!(plan.conflicts, 0);
    assert!(plan.rows[0].error.is_none());
    let mut directory = entry("folder");
    directory.kind = "directory".into();
    let mut rule = add("<CreatedDate>");
    rule.scope = "extension".into();
    let plan = calculate_with_context(&[directory.clone()], &[directory.id], &[rule], 0, &context)
        .unwrap();
    assert_eq!(plan.conflicts, 0);
}

#[test]
fn variables_expand_before_padding_and_regex_values_stay_literal() {
    let mut e = entry("a");
    e.kind = "directory".into();
    let context = snapshot("2000-01-01T00:00:00+08:00");
    let mut rule = add("<CName>");
    if let RuleConfig::Add { pad, width, .. } = &mut rule.config {
        *pad = true;
        *width = 4;
    }
    let plan = calculate_with_context(&[e.clone()], &[e.id], &[rule], 0, &context).unwrap();
    assert_eq!(plan.rows[0].new_name, "aaaa");
    let mut e = entry("$1$tag.txt");
    e.kind = "directory".into();
    let rule = RenameRule {
        id: "replace".into(),
        enabled: true,
        scope: "full".into(),
        config: RuleConfig::Replace {
            find: "(.*)".into(),
            replacement: "${1}_<Name>_$$".into(),
            regex: true,
            sensitive: true,
            occurrence: 1,
        },
    };
    let plan = calculate_with_context(&[e.clone()], &[e.id], &[rule], 0, &context).unwrap();
    assert_eq!(plan.rows[0].new_name, "$1$tag.txt_$1$tag.txt_$");
    let e = entry("abc.txt");
    let rule = RenameRule {
        id: "find".into(),
        enabled: true,
        scope: "stem".into(),
        config: RuleConfig::Replace {
            find: "<Date>".into(),
            replacement: "_".into(),
            regex: false,
            sensitive: true,
            occurrence: 0,
        },
    };
    let plan = calculate_with_context(&[e.clone()], &[e.id], &[rule], 0, &context).unwrap();
    assert_eq!(plan.rows[0].new_name, "abc.txt");
}

#[test]
fn dates_are_one_snapshot_and_new_previews_get_a_new_snapshot() {
    let entries = [entry("a.txt"), entry("b.txt")];
    let ids = entries.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let rules = [add("<Date>_<Time>_")];
    let before = snapshot("2000-12-31T23:59:59+08:00");
    let after = snapshot("2001-01-01T00:00:00+08:00");
    let plan = calculate_with_context(&entries, &ids, &rules, 0, &before).unwrap();
    assert_eq!(plan.rows[0].new_name, "2000-12-31_23-59-59_a.txt");
    assert_eq!(plan.rows[1].new_name, "2000-12-31_23-59-59_b.txt");
    let new_plan = calculate_with_context(&entries, &ids, &rules, 1, &after).unwrap();
    assert_eq!(new_plan.rows[0].new_name, "2001-01-01_00-00-00_a.txt");
    let rechecked = calculate_with_context(&entries, &ids, &rules, 0, &before).unwrap();
    assert_eq!(plan.rows[0].new_name, rechecked.rows[0].new_name);
}

#[test]
fn filesystem_preview_matches_execution_and_restart_undo() {
    let temp = tempfile::tempdir().unwrap();
    let folder = temp.path().join("parent");
    fs::create_dir(&folder).unwrap();
    fs::write(folder.join("a.txt"), "payload").unwrap();
    let db = temp.path().join("journal.db");
    let mut engine = Engine::open(&db).unwrap();
    let entries = engine
        .scan(vec![folder.to_str().unwrap().into()], true, true, &|_| {})
        .unwrap();
    let ids = entries.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let plan = engine
        .preview(ids.clone(), ids, vec![add("<Time>_<ParentDir>_")], 0)
        .unwrap();
    assert_eq!(plan.conflicts, 0);
    let file = plan.rows.iter().find(|r| r.kind == "file").unwrap().clone();
    assert!(file.new_name.ends_with("_parent_a.txt"));
    // Actual execution crosses a whole-second boundary, but retains the previewed time.
    std::thread::sleep(std::time::Duration::from_millis(1100));
    let op = engine.execute(&plan.id, &|_| {}).unwrap();
    assert_eq!(fs::read_to_string(&file.target_path).unwrap(), "payload");
    drop(engine);
    Engine::open(&db).unwrap().undo(&op.id, &|_| {}).unwrap();
    assert_eq!(fs::read_to_string(folder.join("a.txt")).unwrap(), "payload");
}

#[test]
fn file_metadata_variables_are_read_without_fallback() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("a.txt");
    fs::write(&file, "payload").unwrap();
    let mut engine = Engine::open(&temp.path().join("journal.db")).unwrap();
    let entries = engine
        .scan(vec![file.to_str().unwrap().into()], false, false, &|_| {})
        .unwrap();
    let ids = entries.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let expected = chrono::DateTime::<chrono::Local>::from(
        fs::symlink_metadata(&file).unwrap().modified().unwrap(),
    )
    .format("%Y-%m-%d_%H-%M-%S")
    .to_string();
    let plan = engine
        .preview(ids.clone(), ids, vec![add("<ModifiedDateTime>_")], 0)
        .unwrap();
    assert_eq!(plan.rows[0].new_name, format!("{expected}_a.txt"));
    assert_eq!(plan.conflicts, 0);
}

#[test]
fn variable_names_keep_conflict_identity_and_rollback_checks() {
    let temp = tempfile::tempdir().unwrap();
    let a = temp.path().join("a.txt");
    let b = temp.path().join("b.txt");
    fs::write(&a, "A").unwrap();
    fs::write(&b, "B").unwrap();
    let mut engine = Engine::open(&temp.path().join("journal.db")).unwrap();
    let entries = engine
        .scan(
            vec![a.to_str().unwrap().into(), b.to_str().unwrap().into()],
            false,
            false,
            &|_| {},
        )
        .unwrap();
    let ids = entries.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let plan = engine
        .preview(ids.clone(), ids.clone(), vec![add("<Date>_")], 0)
        .unwrap();
    let occupied = plan
        .rows
        .iter()
        .find(|row| row.original_name == "b.txt")
        .unwrap()
        .target_path
        .clone();
    let created = std::cell::Cell::new(false);
    let error = engine
        .execute(&plan.id, &|progress| {
            if progress.done == 1 && !created.replace(true) {
                fs::write(&occupied, "external").unwrap();
            }
        })
        .unwrap_err();
    assert_eq!(error.code, "rolledBack");
    assert_eq!(fs::read_to_string(&a).unwrap(), "A");
    assert_eq!(fs::read_to_string(&b).unwrap(), "B");
    assert_eq!(fs::read_to_string(&occupied).unwrap(), "external");
    let plan = engine
        .preview(ids.clone(), ids.clone(), vec![add("<Date>_")], 1)
        .unwrap();
    assert_eq!(plan.conflicts, 1);
    assert_eq!(
        engine.execute(&plan.id, &|_| {}).unwrap_err().code,
        "conflicts"
    );
    let plan = engine
        .preview(ids.clone(), ids, vec![add("<Time>_")], 2)
        .unwrap();
    fs::write(&a, "changed").unwrap();
    assert_eq!(
        engine.execute(&plan.id, &|_| {}).unwrap_err().code,
        "stalePlan"
    );
    assert_eq!(fs::read_to_string(&a).unwrap(), "changed");
}

#[test]
fn ten_thousand_variable_names_share_one_time_snapshot() {
    let temp = tempfile::tempdir().unwrap();
    let entries = (0..10000)
        .map(|i| {
            let mut entry = entry(&format!("image{i}.png"));
            entry.path = temp.path().join(&entry.name).to_str().unwrap().into();
            entry
        })
        .collect::<Vec<_>>();
    let ids = entries.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let context = snapshot("2000-01-01T12:34:56+08:00");
    let started = std::time::Instant::now();
    let plan =
        calculate_with_context(&entries, &ids, &[add("<DateTime>_<Ext>_")], 0, &context).unwrap();
    assert_eq!(plan.changes, 10000);
    assert_eq!(plan.conflicts, 0);
    assert_eq!(
        plan.rows[9999].new_name,
        "2000-01-01_12-34-56_png_image9999.png"
    );
    println!("10000-row template preview: {:?}", started.elapsed());
}
