use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Root,
    Object,
    Array,
    Property,
    Item,
    String,
    Number,
    Boolean,
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub kind: NodeKind,
    pub path: String,
    pub value_preview: Option<String>,
    pub child_count: u32,
    pub expandable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphSnapshot {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub truncated: bool,
    pub total_nodes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChildrenSlice {
    pub parent_path: String,
    pub parent_id: String,
    pub total_children: u32,
    pub offset: u32,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub has_more: bool,
}

pub fn list_children(value: &Value, path: &str, offset: u32, limit: u32) -> ChildrenSlice {
    let target = resolve_path(value, path);
    let parent_id = path_to_id(path);
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    let limit = limit.max(1);

    match target {
        Value::Object(map) => {
            let total = map.len() as u32;
            for (index, (key, child)) in map.iter().enumerate() {
                if index < offset as usize {
                    continue;
                }
                if nodes.len() as u32 >= limit {
                    break;
                }
                let child_path = if path.is_empty() {
                    key.clone()
                } else {
                    format!("{path}.{key}")
                };
                let id = path_to_id(&child_path);
                nodes.push(make_node(
                    &id,
                    key.clone(),
                    NodeKind::Property,
                    &child_path,
                    child,
                    child_count(child),
                    is_expandable(child),
                ));
                edges.push(GraphEdge {
                    id: format!("{parent_id}-{id}"),
                    source: parent_id.clone(),
                    target: id.clone(),
                    label: Some(key.clone()),
                });
            }
            let returned = nodes.len() as u32;
            ChildrenSlice {
                parent_path: path.to_string(),
                parent_id,
                total_children: total,
                offset,
                nodes,
                edges,
                has_more: offset + returned < total,
            }
        }
        Value::Array(items) => {
            let total = items.len() as u32;
            for (index, child) in items.iter().enumerate() {
                if index < offset as usize {
                    continue;
                }
                if nodes.len() as u32 >= limit {
                    break;
                }
                let child_path = if path.is_empty() {
                    format!("[{index}]")
                } else {
                    format!("{path}[{index}]")
                };
                let id = path_to_id(&child_path);
                nodes.push(make_node(
                    &id,
                    format!("[{index}]"),
                    NodeKind::Item,
                    &child_path,
                    child,
                    child_count(child),
                    is_expandable(child),
                ));
                edges.push(GraphEdge {
                    id: format!("{parent_id}-{id}"),
                    source: parent_id.clone(),
                    target: id.clone(),
                    label: Some(format!("[{index}]")),
                });
            }
            let returned = nodes.len() as u32;
            ChildrenSlice {
                parent_path: path.to_string(),
                parent_id,
                total_children: total,
                offset,
                nodes,
                edges,
                has_more: offset + returned < total,
            }
        }
        _ => ChildrenSlice {
            parent_path: path.to_string(),
            parent_id,
            total_children: 0,
            offset,
            nodes,
            edges,
            has_more: false,
        },
    }
}

fn path_to_id(path: &str) -> String {
    if path.is_empty() {
        "root".to_string()
    } else {
        path.replace(['.', '[', ']'], "_")
    }
}

pub fn build_graph(value: &Value, max_nodes: u32, expand_depth: u32) -> GraphSnapshot {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut counter = 0u32;
    let mut truncated = false;

    let root_id = "root".to_string();
    nodes.push(make_node(
        &root_id,
        root_label(value),
        NodeKind::Root,
        "",
        value,
        child_count(value),
        is_expandable(value),
    ));

    if expand_depth > 0 {
        walk(
            value,
            &root_id,
            "",
            expand_depth,
            max_nodes,
            &mut nodes,
            &mut edges,
            &mut counter,
            &mut truncated,
        );
    }

    GraphSnapshot {
        total_nodes: nodes.len() as u32,
        nodes,
        edges,
        truncated,
    }
}

pub fn expand_path(value: &Value, path: &str, max_nodes: u32) -> GraphSnapshot {
    let target = resolve_path(value, path);
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut counter = 0u32;
    let mut truncated = false;

    let node_id = if path.is_empty() {
        "root".to_string()
    } else {
        path.replace('.', "_")
    };

    nodes.push(make_node(
        &node_id,
        if path.is_empty() {
            root_label(value)
        } else {
            path.rsplit('.').next().unwrap_or(path).to_string()
        },
        if path.is_empty() {
            NodeKind::Root
        } else {
            kind_for_value(target)
        },
        path,
        target,
        child_count(target),
        is_expandable(target),
    ));

    // Depth 1: load exactly one level so the UI can expand lazily, one click
    // at a time. Critical for deeply nested LLM outputs.
    walk(
        target,
        &node_id,
        path,
        1,
        max_nodes,
        &mut nodes,
        &mut edges,
        &mut counter,
        &mut truncated,
    );

    GraphSnapshot {
        total_nodes: nodes.len() as u32,
        nodes,
        edges,
        truncated,
    }
}

fn walk(
    value: &Value,
    parent_id: &str,
    parent_path: &str,
    depth: u32,
    max_nodes: u32,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    counter: &mut u32,
    truncated: &mut bool,
) {
    if depth == 0 || *counter >= max_nodes {
        if *counter >= max_nodes {
            *truncated = true;
        }
        return;
    }

    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if *counter >= max_nodes {
                    *truncated = true;
                    return;
                }
                *counter += 1;
                let path = if parent_path.is_empty() {
                    key.clone()
                } else {
                    format!("{parent_path}.{key}")
                };
                let id = path.replace('.', "_");
                nodes.push(make_node(
                    &id,
                    key.clone(),
                    NodeKind::Property,
                    &path,
                    child,
                    child_count(child),
                    is_expandable(child),
                ));
                edges.push(GraphEdge {
                    id: format!("{parent_id}-{id}"),
                    source: parent_id.to_string(),
                    target: id.clone(),
                    label: Some(key.clone()),
                });
                walk(
                    child,
                    &id,
                    &path,
                    depth - 1,
                    max_nodes,
                    nodes,
                    edges,
                    counter,
                    truncated,
                );
            }
        }
        Value::Array(items) => {
            // Respect the global node budget only — no separate per-array cap.
            // Large arrays (e.g. 2k records) will fill up to max_nodes, then stop.
            for (index, child) in items.iter().enumerate() {
                if *counter >= max_nodes {
                    *truncated = true;
                    return;
                }
                *counter += 1;
                let path = format!("{parent_path}[{index}]");
                let id = path.replace(['.', '[', ']'], "_");
                nodes.push(make_node(
                    &id,
                    format!("[{index}]"),
                    NodeKind::Item,
                    &path,
                    child,
                    child_count(child),
                    is_expandable(child),
                ));
                edges.push(GraphEdge {
                    id: format!("{parent_id}-{id}"),
                    source: parent_id.to_string(),
                    target: id.clone(),
                    label: Some(format!("[{index}]")),
                });
                walk(
                    child,
                    &id,
                    &path,
                    depth - 1,
                    max_nodes,
                    nodes,
                    edges,
                    counter,
                    truncated,
                );
            }
        }
        _ => {}
    }
}

fn make_node(
    id: &str,
    label: String,
    kind: NodeKind,
    path: &str,
    value: &Value,
    child_count: u32,
    expandable: bool,
) -> GraphNode {
    GraphNode {
        id: id.to_string(),
        label,
        kind,
        path: path.to_string(),
        value_preview: preview_value(value),
        child_count,
        expandable,
    }
}

fn preview_value(value: &Value) -> Option<String> {
    match value {
        Value::Null => Some("null".to_string()),
        Value::Bool(v) => Some(v.to_string()),
        Value::Number(v) => Some(v.to_string()),
        Value::String(v) => Some(format!("\"{}\"", crate::util::truncate_chars(v, 77))),
        Value::Array(items) => Some(format!("[{} items]", items.len())),
        Value::Object(map) => Some(format!("{{{}}} keys", map.len())),
    }
}

fn root_label(value: &Value) -> String {
    match value {
        Value::Array(items) => format!("Array[{}]", items.len()),
        Value::Object(map) => format!("Object{{{}}}", map.len()),
        other => preview_value(other).unwrap_or_else(|| "value".to_string()),
    }
}

fn child_count(value: &Value) -> u32 {
    match value {
        Value::Object(map) => map.len() as u32,
        Value::Array(items) => items.len() as u32,
        _ => 0,
    }
}

fn is_expandable(value: &Value) -> bool {
    matches!(value, Value::Object(_) | Value::Array(_))
}

fn kind_for_value(value: &Value) -> NodeKind {
    match value {
        Value::Object(_) => NodeKind::Object,
        Value::Array(_) => NodeKind::Array,
        Value::String(_) => NodeKind::String,
        Value::Number(_) => NodeKind::Number,
        Value::Bool(_) => NodeKind::Boolean,
        Value::Null => NodeKind::Null,
    }
}

/// Resolve a dotted/bracketed path to the value at that location.
/// Returns `Value::Null` semantics for missing paths (via serde_json indexing).
pub fn value_at<'a>(value: &'a Value, path: &str) -> &'a Value {
    resolve_path(value, path)
}

fn resolve_path<'a>(value: &'a Value, path: &str) -> &'a Value {
    if path.is_empty() {
        return value;
    }

    let mut current = value;
    let mut rest = path;
    while !rest.is_empty() {
        if let Some((head, tail)) = rest.split_once('.') {
            current = &current[head];
            rest = tail;
            continue;
        }

        if rest.contains('[') {
            let bracket = rest.find('[').unwrap();
            if bracket > 0 {
                current = &current[&rest[..bracket]];
            }
            let close = rest.find(']').unwrap();
            let index: usize = rest[bracket + 1..close].parse().unwrap_or(0);
            current = &current[index];
            rest = if close + 1 < rest.len() {
                &rest[close + 1..]
            } else {
                ""
            };
            if rest.starts_with('.') {
                rest = &rest[1..];
            }
            continue;
        }

        current = &current[rest];
        break;
    }
    current
}
