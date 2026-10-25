use renamer_lib::{model::*, rules::*};
fn pos(mode: &str) -> Position {
    Position {
        mode: mode.into(),
        ..Default::default()
    }
}
fn sel(mode: &str) -> Selection {
    Selection {
        mode: mode.into(),
        ..Default::default()
    }
}
#[test]
fn unicode_add_padding_and_anchors() {
    let cfg = RuleConfig::Add {
        text: "好".into(),
        pad: true,
        width: 4,
        position: pos("prefix"),
    };
    assert_eq!(apply("👨‍👩‍👧‍👦é", &cfg, 0).unwrap(), "好好👨‍👩‍👧‍👦é");
    let cfg = RuleConfig::Add {
        text: "-".into(),
        pad: false,
        width: 1,
        position: Position {
            marker: "_".into(),
            occurrence: 2,
            ..pos("after")
        },
    };
    assert_eq!(apply("甲_乙_丙", &cfg, 0).unwrap(), "甲_乙_-丙");
    assert_eq!(apply("甲乙", &cfg, 0).unwrap(), "甲乙");
}
#[test]
fn replacement_literal_and_captures() {
    let cfg = RuleConfig::Replace {
        find: "a".into(),
        replacement: "$1".into(),
        regex: false,
        sensitive: false,
        occurrence: 2,
    };
    assert_eq!(apply("AaA", &cfg, 0).unwrap(), "A$1A");
    let cfg = RuleConfig::Replace {
        find: "([a-z]+)-(\\d+)".into(),
        replacement: "${2}_${1}".into(),
        regex: true,
        sensitive: true,
        occurrence: 0,
    };
    assert_eq!(apply("img-12", &cfg, 0).unwrap(), "12_img");
}
#[test]
fn remove_and_keep_ranges() {
    let mut selection = sel("range");
    selection.index = 2;
    selection.length = 2;
    selection.from_end = true;
    let cfg = RuleConfig::Remove {
        mode: "selection".into(),
        keep: true,
        selection,
        text: String::new(),
        category: "digits".into(),
    };
    assert_eq!(apply("甲乙丙丁", &cfg, 0).unwrap(), "乙丙");
    let cfg = RuleConfig::Remove {
        mode: "selection".into(),
        keep: false,
        selection: Selection {
            marker: "[".into(),
            right: "]".into(),
            include: true,
            ..sel("between")
        },
        text: String::new(),
        category: "digits".into(),
    };
    assert_eq!(apply("a[中文]b", &cfg, 0).unwrap(), "ab");
}
#[test]
fn number_move_and_case() {
    let cfg = RuleConfig::Number {
        start: -2,
        step: 3,
        width: 3,
        fill: "0".into(),
        per_directory: false,
        position: pos("prefix"),
    };
    assert_eq!(apply("图", &cfg, 0).unwrap(), "-002图");
    assert_eq!(apply("图", &cfg, 1).unwrap(), "001图");
    let cfg = RuleConfig::Move {
        selection: Selection {
            index: 2,
            length: 2,
            ..sel("range")
        },
        distance: 99,
        left: false,
    };
    assert_eq!(apply("ABCDE", &cfg, 0).unwrap(), "ADEBC");
    let cfg = RuleConfig::Case {
        mode: "title".into(),
        delimiters: " _-".into(),
    };
    assert_eq!(apply("hELLO_wORLD", &cfg, 0).unwrap(), "Hello_World");
}
#[test]
fn scope_and_validation() {
    let r = RenameRule {
        id: "x".into(),
        enabled: true,
        scope: "stem".into(),
        config: RuleConfig::Case {
            mode: "upper".into(),
            delimiters: " ".into(),
        },
    };
    assert_eq!(
        apply_scoped("file.tar.gz", false, &r, 0).unwrap(),
        "FILE.TAR.gz"
    );
    assert_eq!(apply_scoped(".env", false, &r, 0).unwrap(), ".ENV");
    assert_eq!(apply_scoped("a.b", true, &r, 0).unwrap(), "A.B");
    let mut r = r;
    r.config = RuleConfig::Replace {
        find: "(?=a)".into(),
        replacement: "b".into(),
        regex: true,
        sensitive: true,
        occurrence: 0,
    };
    assert!(validate(&r).is_err());
}
