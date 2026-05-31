use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A single match produced by a query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryMatch {
    pub path: String,
    pub value: Value,
    pub type_name: String,
}

/// Result of running a query against a document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub matches: Vec<QueryMatch>,
    pub total: usize,
    pub truncated: bool,
    /// Distribution of result value types, useful for LLM output sanity checks.
    pub type_breakdown: Vec<(String, usize)>,
}

#[derive(Debug, Clone)]
enum Step {
    Key(String),
    Index(i64),
    Wildcard,
    Recursive,
}

/// Run a focused JSONPath-style query.
///
/// Supported syntax (a pragmatic subset that covers LLM-output extraction):
/// - `$`              root
/// - `.field`         object key
/// - `['field']`      object key (quoted, allows dots/spaces)
/// - `[n]` / `[-n]`   array index (negative counts from the end)
/// - `[*]` / `.*`     wildcard over array items or object values
/// - `..field`        recursive descent
pub fn run_query(root: &Value, query: &str, limit: usize) -> Result<QueryResult, String> {
    let steps = parse_query(query)?;
    let mut current: Vec<(String, &Value)> = vec![(String::new(), root)];

    for step in &steps {
        let mut next: Vec<(String, &Value)> = Vec::new();
        for (path, value) in &current {
            apply_step(step, path, value, &mut next);
        }
        current = next;
        if current.is_empty() {
            break;
        }
    }

    let total = current.len();
    let truncated = total > limit;

    let mut type_counts: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    for (_, value) in &current {
        *type_counts.entry(type_name(value).to_string()).or_default() += 1;
    }
    let type_breakdown = type_counts.into_iter().collect();

    let matches = current
        .into_iter()
        .take(limit)
        .map(|(path, value)| QueryMatch {
            path: if path.is_empty() { "$".to_string() } else { path },
            value: value.clone(),
            type_name: type_name(value).to_string(),
        })
        .collect();

    Ok(QueryResult {
        matches,
        total,
        truncated,
        type_breakdown,
    })
}

fn apply_step<'a>(step: &Step, path: &str, value: &'a Value, out: &mut Vec<(String, &'a Value)>) {
    match step {
        Step::Key(key) => {
            if let Value::Object(map) = value {
                if let Some(child) = map.get(key) {
                    out.push((join_key(path, key), child));
                }
            }
        }
        Step::Index(idx) => {
            if let Value::Array(items) = value {
                let len = items.len() as i64;
                let real = if *idx < 0 { len + idx } else { *idx };
                if real >= 0 && (real as usize) < items.len() {
                    out.push((format!("{path}[{real}]"), &items[real as usize]));
                }
            }
        }
        Step::Wildcard => match value {
            Value::Array(items) => {
                for (index, child) in items.iter().enumerate() {
                    out.push((format!("{path}[{index}]"), child));
                }
            }
            Value::Object(map) => {
                for (key, child) in map {
                    out.push((join_key(path, key), child));
                }
            }
            _ => {}
        },
        Step::Recursive => collect_descendants(path, value, out),
    }
}

fn collect_descendants<'a>(path: &str, value: &'a Value, out: &mut Vec<(String, &'a Value)>) {
    out.push((path.to_string(), value));
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                collect_descendants(&join_key(path, key), child, out);
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                collect_descendants(&format!("{path}[{index}]"), child, out);
            }
        }
        _ => {}
    }
}

fn join_key(path: &str, key: &str) -> String {
    if path.is_empty() {
        key.to_string()
    } else {
        format!("{path}.{key}")
    }
}

fn type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(n) => {
            if n.is_i64() || n.is_u64() {
                "integer"
            } else {
                "number"
            }
        }
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn parse_query(query: &str) -> Result<Vec<Step>, String> {
    let trimmed = query.trim();
    let body = trimmed.strip_prefix('$').unwrap_or(trimmed);
    let chars: Vec<char> = body.chars().collect();
    let mut steps = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        match chars[i] {
            '.' => {
                if i + 1 < chars.len() && chars[i + 1] == '.' {
                    steps.push(Step::Recursive);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            '*' => {
                steps.push(Step::Wildcard);
                i += 1;
            }
            '[' => {
                let close = chars[i..]
                    .iter()
                    .position(|&c| c == ']')
                    .map(|p| p + i)
                    .ok_or_else(|| "Unbalanced '[' in query".to_string())?;
                let inner: String = chars[i + 1..close].iter().collect();
                let inner = inner.trim();
                if inner == "*" {
                    steps.push(Step::Wildcard);
                } else if (inner.starts_with('\'') && inner.ends_with('\''))
                    || (inner.starts_with('"') && inner.ends_with('"'))
                {
                    steps.push(Step::Key(inner[1..inner.len() - 1].to_string()));
                } else if let Ok(index) = inner.parse::<i64>() {
                    steps.push(Step::Index(index));
                } else {
                    steps.push(Step::Key(inner.to_string()));
                }
                i = close + 1;
            }
            _ => {
                let start = i;
                while i < chars.len() && chars[i] != '.' && chars[i] != '[' && chars[i] != '*' {
                    i += 1;
                }
                let key: String = chars[start..i].iter().collect();
                if !key.is_empty() {
                    steps.push(Step::Key(key));
                }
            }
        }
    }

    Ok(steps)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn doc() -> Value {
        json!([
            {"id": 1, "title": "A", "meta": {"score": 0.9}},
            {"id": 2, "title": "B", "meta": {"score": 0.4}},
        ])
    }

    #[test]
    fn wildcard_extracts_column() {
        let result = run_query(&doc(), "$[*].title", 100).unwrap();
        assert_eq!(result.total, 2);
        assert_eq!(result.matches[0].value, json!("A"));
    }

    #[test]
    fn recursive_descent_finds_nested() {
        let result = run_query(&doc(), "$..score", 100).unwrap();
        assert_eq!(result.total, 2);
    }

    #[test]
    fn negative_index() {
        let result = run_query(&doc(), "$[-1].id", 100).unwrap();
        assert_eq!(result.matches[0].value, json!(2));
    }
}
