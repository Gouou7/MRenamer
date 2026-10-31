use crate::model::*;
use regex::RegexBuilder;
use unicode_categories::UnicodeCategories;
use unicode_segmentation::UnicodeSegmentation;

fn graphemes(s: &str) -> Vec<&str> {
    s.graphemes(true).collect()
}
fn invalid(detail: &str) -> AppError {
    AppError::new("invalidRule", detail)
}
fn occurrence(s: &str, marker: &str, n: usize) -> Option<(usize, usize)> {
    if marker.is_empty() || n == 0 {
        return None;
    }
    let (start, _) = s.match_indices(marker).nth(n - 1)?;
    // A literal cannot split a grapheme even when it matches a combining codepoint.
    let end = start + marker.len();
    let boundaries: Vec<usize> = s
        .grapheme_indices(true)
        .map(|(i, _)| i)
        .chain(std::iter::once(s.len()))
        .collect();
    Some((
        boundaries.iter().position(|&x| x == start)?,
        boundaries.iter().position(|&x| x == end)?,
    ))
}
fn position(s: &str, p: &Position) -> Option<usize> {
    let len = graphemes(s).len();
    match p.mode.as_str() {
        "prefix" => Some(0),
        "suffix" => Some(len),
        "index" if p.index > 0 && p.index <= len + 1 => Some(if p.from_end {
            len + 1 - p.index
        } else {
            p.index - 1
        }),
        "before" => occurrence(s, &p.marker, p.occurrence).map(|x| x.0),
        "after" => occurrence(s, &p.marker, p.occurrence).map(|x| x.1),
        _ => None,
    }
}
fn range(s: &str, q: &Selection) -> Option<(usize, usize)> {
    let len = graphemes(s).len();
    match q.mode.as_str() {
        "range" if q.index > 0 && q.index <= len => {
            let a = if q.from_end {
                len - q.index
            } else {
                q.index - 1
            };
            // From the end, length extends towards the beginning.
            Some(if q.from_end {
                ((a + 1).saturating_sub(q.length), a + 1)
            } else {
                (a, a.saturating_add(q.length).min(len))
            })
        }
        "literal" => occurrence(s, &q.marker, q.occurrence),
        "before" => {
            occurrence(s, &q.marker, q.occurrence).map(|(a, b)| (0, if q.include { b } else { a }))
        }
        "after" => occurrence(s, &q.marker, q.occurrence)
            .map(|(a, b)| (if q.include { a } else { b }, len)),
        "between" => {
            let (a, b) = occurrence(s, &q.marker, q.occurrence)?;
            let gs = graphemes(s);
            let suffix = gs[b..].concat();
            let (c, d) = occurrence(&suffix, &q.right, 1)?;
            Some(if q.include { (a, b + d) } else { (b, b + c) })
        }
        _ => None,
    }
}
fn check_position(p: &Position) -> Result<()> {
    if p.index == 0 || p.occurrence == 0 {
        return Err(invalid("positivePosition"));
    }
    if matches!(p.mode.as_str(), "before" | "after") && p.marker.is_empty() {
        return Err(invalid("emptyMarker"));
    }
    if !["prefix", "suffix", "index", "before", "after"].contains(&p.mode.as_str()) {
        return Err(invalid("positionMode"));
    }
    Ok(())
}
fn check_selection(q: &Selection) -> Result<()> {
    if q.index == 0 || q.length == 0 || q.occurrence == 0 {
        return Err(invalid("positivePosition"));
    }
    if q.mode != "range" && q.marker.is_empty() {
        return Err(invalid("emptyMarker"));
    }
    if q.mode == "between" && q.right.is_empty() {
        return Err(invalid("emptyMarker"));
    }
    if !["range", "literal", "before", "after", "between"].contains(&q.mode.as_str()) {
        return Err(invalid("selectionMode"));
    }
    Ok(())
}
pub fn validate(r: &RenameRule) -> Result<()> {
    if !["stem", "extension", "full"].contains(&r.scope.as_str()) {
        return Err(invalid("scope"));
    }
    match &r.config {
        RuleConfig::Add {
            text,
            width,
            position,
            ..
        } => {
            if text.is_empty() || *width > 4096 {
                return Err(invalid("textOrWidth"));
            }
            check_position(position)?;
        }
        RuleConfig::Replace {
            find,
            regex,
            sensitive,
            ..
        } => {
            if find.is_empty() {
                return Err(invalid("emptyFind"));
            }
            if *regex {
                RegexBuilder::new(find)
                    .case_insensitive(!sensitive)
                    .size_limit(4_000_000)
                    .build()
                    .map_err(|e| AppError::new("invalidRegex", e))?;
            }
        }
        RuleConfig::Remove {
            mode,
            selection,
            text,
            category,
            ..
        } => match mode.as_str() {
            "selection" => check_selection(selection)?,
            "text" if text.is_empty() => return Err(invalid("emptyFind")),
            "category"
                if !["digits", "letters", "whitespace", "punctuation"]
                    .contains(&category.as_str()) =>
            {
                return Err(invalid("category"))
            }
            "trim" | "clear" | "text" | "category" => (),
            _ => return Err(invalid("removeMode")),
        },
        RuleConfig::Number {
            style,
            start,
            step,
            width,
            fill,
            position,
            ..
        } => {
            if *step == 0
                || (*style == NumberStyle::Numeric
                    && (*width == 0 || *width > 64 || graphemes(fill).len() != 1))
                || (*style != NumberStyle::Numeric && *start < 1)
            {
                return Err(invalid("numberSettings"));
            }
            check_position(position)?;
        }
        RuleConfig::Move { selection, .. } => check_selection(selection)?,
        RuleConfig::Case { mode, .. } => {
            if !["upper", "lower", "title", "sentence", "toggle"].contains(&mode.as_str()) {
                return Err(invalid("caseMode"));
            }
        }
    }
    Ok(())
}
fn insert(s: &str, text: &str, p: &Position) -> String {
    if let Some(i) = position(s, p) {
        let gs = graphemes(s);
        format!("{}{}{}", gs[..i].concat(), text, gs[i..].concat())
    } else {
        s.into()
    }
}
pub fn apply(s: &str, config: &RuleConfig, ordinal: usize) -> Result<String> {
    apply_expanded(s, config, ordinal, None)
}
fn apply_expanded(
    s: &str,
    config: &RuleConfig,
    ordinal: usize,
    expansion: Option<&crate::template::ExpandedTemplate>,
) -> Result<String> {
    Ok(match config {
        RuleConfig::Add {
            text,
            pad,
            width,
            position,
        } => {
            let resolved = expansion.map(|template| template.render(None));
            let text = resolved.as_ref().unwrap_or(text);
            let text = if *pad {
                let missing = width.saturating_sub(graphemes(s).len());
                graphemes(text)
                    .into_iter()
                    .cycle()
                    .take(missing)
                    .collect::<String>()
            } else {
                text.clone()
            };
            insert(s, &text, position)
        }
        RuleConfig::Replace {
            find,
            replacement,
            regex,
            sensitive,
            occurrence,
        } => {
            let pattern = if *regex {
                find.clone()
            } else {
                regex::escape(find)
            };
            let re = RegexBuilder::new(&pattern)
                .case_insensitive(!sensitive)
                .size_limit(4_000_000)
                .build()
                .map_err(|e| AppError::new("invalidRegex", e))?;
            let mut out = String::new();
            let mut end = 0;
            for (i, caps) in re.captures_iter(s).enumerate() {
                let m = caps.get(0).unwrap();
                if *occurrence != 0 && i + 1 != *occurrence {
                    continue;
                }
                out.push_str(&s[end..m.start()]);
                if let Some(expansion) = expansion {
                    out.push_str(&expansion.render(if *regex { Some(&caps) } else { None }));
                } else if *regex {
                    caps.expand(replacement, &mut out);
                } else {
                    out.push_str(replacement);
                }
                end = m.end();
            }
            out.push_str(&s[end..]);
            out
        }
        RuleConfig::Remove {
            mode,
            keep,
            selection,
            text,
            category,
        } => match mode.as_str() {
            "trim" => s.trim().into(),
            "clear" => String::new(),
            "text" => s.replace(text, ""),
            "category" => s
                .chars()
                .filter(|c| !match category.as_str() {
                    "digits" => c.is_number(),
                    "letters" => c.is_alphabetic(),
                    "whitespace" => c.is_whitespace(),
                    "punctuation" => c.is_punctuation(),
                    _ => false,
                })
                .collect(),
            _ => {
                if let Some((a, b)) = range(s, selection) {
                    let gs = graphemes(s);
                    if *keep {
                        gs[a..b].concat()
                    } else {
                        format!("{}{}", gs[..a].concat(), gs[b..].concat())
                    }
                } else {
                    s.into()
                }
            }
        },
        RuleConfig::Number {
            style,
            start,
            step,
            width,
            fill,
            position,
            ..
        } => {
            let n = (*start as i128)
                .checked_add(
                    (*step as i128)
                        .checked_mul(ordinal as i128)
                        .ok_or_else(|| invalid("numberOverflow"))?,
                )
                .ok_or_else(|| invalid("numberOverflow"))?;
            let text = match style {
                NumberStyle::Numeric => {
                    let digits = n.abs().to_string();
                    format!(
                        "{}{}{}",
                        if n < 0 { "-" } else { "" },
                        fill.repeat(width.saturating_sub(digits.len())),
                        digits
                    )
                }
                NumberStyle::Upper | NumberStyle::Lower => {
                    if *start < 1 {
                        return Err(invalid("numberSettings"));
                    }
                    let base = if *style == NumberStyle::Upper {
                        b'A'
                    } else {
                        b'a'
                    };
                    let mut remaining = n;
                    let mut letters = Vec::new();
                    // Bijective base 26: 1=A, 26=Z, 27=AA.
                    while remaining > 0 {
                        remaining -= 1;
                        letters.push((base + (remaining % 26) as u8) as char);
                        remaining /= 26;
                    }
                    letters.into_iter().rev().collect()
                }
            };
            insert(s, &text, position)
        }
        RuleConfig::Move {
            selection,
            distance,
            left,
        } => {
            if let Some((a, b)) = range(s, selection) {
                let mut gs = graphemes(s);
                let taken = gs.drain(a..b).collect::<String>();
                let dst = if *left {
                    a.saturating_sub(*distance)
                } else {
                    a.saturating_add(*distance).min(gs.len())
                };
                format!("{}{}{}", gs[..dst].concat(), taken, gs[dst..].concat())
            } else {
                s.into()
            }
        }
        RuleConfig::Case { mode, delimiters } => match mode.as_str() {
            "upper" => s.to_uppercase(),
            "lower" => s.to_lowercase(),
            "toggle" => s
                .chars()
                .map(|c| {
                    if c.is_uppercase() {
                        c.to_lowercase().to_string()
                    } else {
                        c.to_uppercase().to_string()
                    }
                })
                .collect(),
            _ => {
                let mut first = true;
                s.chars()
                    .map(|c| {
                        if mode == "title" && delimiters.contains(c) {
                            first = true;
                            return c.to_string();
                        }
                        if c.is_alphabetic() {
                            let v = if first {
                                c.to_uppercase().to_string()
                            } else {
                                c.to_lowercase().to_string()
                            };
                            first = false;
                            v
                        } else {
                            c.to_string()
                        }
                    })
                    .collect()
            }
        },
    })
}
pub fn apply_scoped(
    name: &str,
    directory: bool,
    rule: &RenameRule,
    ordinal: usize,
) -> Result<String> {
    apply_scoped_expanded(name, directory, rule, ordinal, None)
}
pub fn apply_scoped_expanded(
    name: &str,
    directory: bool,
    rule: &RenameRule,
    ordinal: usize,
    expansion: Option<&crate::template::ExpandedTemplate>,
) -> Result<String> {
    if !rule.enabled || (directory && rule.scope == "extension") {
        return Ok(name.into());
    }
    if directory || rule.scope == "full" {
        return apply_expanded(name, &rule.config, ordinal, expansion);
    }
    let split = name.rfind('.').filter(|&i| i > 0);
    match (rule.scope.as_str(), split) {
        ("stem", Some(i)) => Ok(format!(
            "{}{}",
            apply_expanded(&name[..i], &rule.config, ordinal, expansion)?,
            &name[i..]
        )),
        ("extension", Some(i)) => {
            let ext = apply_expanded(&name[i + 1..], &rule.config, ordinal, expansion)?;
            Ok(format!(
                "{}{}{}",
                &name[..i],
                if ext.is_empty() { "" } else { "." },
                ext
            ))
        }
        ("extension", None) => Ok(name.into()),
        _ => apply_expanded(name, &rule.config, ordinal, expansion),
    }
}
