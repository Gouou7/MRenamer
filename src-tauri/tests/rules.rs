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
        style: NumberStyle::Numeric,
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

fn alphabetic(style: NumberStyle, start: i64, step: u64) -> RuleConfig {
    RuleConfig::Number {
        style,
        start,
        step,
        width: 3,
        fill: "0".into(),
        per_directory: false,
        position: pos("prefix"),
    }
}

#[test]
fn alphabetic_numbering_crosses_letter_boundaries_in_both_cases() {
    for (style, expected) in [
        (
            NumberStyle::Upper,
            ["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"],
        ),
        (
            NumberStyle::Lower,
            ["a", "z", "aa", "az", "ba", "zz", "aaa"],
        ),
    ] {
        let cfg = alphabetic(style, 1, 1);
        for (ordinal, letters) in [0, 25, 26, 51, 52, 701, 702].into_iter().zip(expected) {
            assert_eq!(apply("图", &cfg, ordinal).unwrap(), format!("{letters}图"));
        }
    }
    let cfg = alphabetic(NumberStyle::Upper, 25, 2);
    assert_eq!(apply("图", &cfg, 0).unwrap(), "Y图");
    assert_eq!(apply("图", &cfg, 1).unwrap(), "AA图");
    assert_eq!(apply("图", &cfg, 2).unwrap(), "AC图");
}

#[test]
fn alphabetic_numbering_validates_start_and_ignores_numeric_padding() {
    let mut rule = RenameRule {
        id: "letters".into(),
        enabled: true,
        scope: "stem".into(),
        config: alphabetic(NumberStyle::Lower, 1, 1),
    };
    if let RuleConfig::Number { width, fill, .. } = &mut rule.config {
        *width = 0;
        *fill = String::new();
    }
    assert!(validate(&rule).is_ok());
    assert_eq!(
        apply_scoped("file.tar.gz", false, &rule, 26).unwrap(),
        "aafile.tar.gz"
    );
    rule.scope = "extension".into();
    assert_eq!(
        apply_scoped("file.txt", false, &rule, 0).unwrap(),
        "file.atxt"
    );
    assert_eq!(apply_scoped("folder", true, &rule, 0).unwrap(), "folder");
    for start in [0, -1, i64::MIN] {
        rule.config = alphabetic(NumberStyle::Upper, start, 1);
        let error = validate(&rule).unwrap_err();
        assert_eq!(error.code, "invalidRule");
        assert_eq!(error.detail, "numberSettings");
        assert!(apply("file", &rule.config, 0).is_err());
    }
    rule.config = alphabetic(NumberStyle::Upper, 1, 0);
    assert!(validate(&rule).is_err());
    // Large ordinals either produce a valid sequence or a checked overflow.
    let cfg = alphabetic(NumberStyle::Upper, i64::MAX, u64::MAX);
    match apply("", &cfg, usize::MAX) {
        Ok(value) => assert!(value.chars().all(|c| c.is_ascii_uppercase())),
        Err(error) => assert_eq!(error.detail, "numberOverflow"),
    }
}

#[test]
fn legacy_numbering_defaults_to_numeric_and_rejects_unknown_styles() {
    let legacy = serde_json::json!({
        "type": "number", "start": -2, "step": 3, "width": 3,
        "fill": "0", "perDirectory": false, "position": pos("prefix")
    });
    let cfg: RuleConfig = serde_json::from_value(legacy.clone()).unwrap();
    assert_eq!(apply("图", &cfg, 0).unwrap(), "-002图");
    assert_eq!(apply("图", &cfg, 1).unwrap(), "001图");
    let mut invalid = legacy;
    invalid["style"] = serde_json::json!("unknown");
    assert!(serde_json::from_value::<RuleConfig>(invalid).is_err());
    for style in [NumberStyle::Upper, NumberStyle::Lower] {
        let cfg = alphabetic(style, 27, 1);
        let serialized = serde_json::to_value(&cfg).unwrap();
        let restored: RuleConfig = serde_json::from_value(serialized).unwrap();
        assert_eq!(
            apply("图", &cfg, 0).unwrap(),
            apply("图", &restored, 0).unwrap()
        );
    }
}
