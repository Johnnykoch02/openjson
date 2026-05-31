use crate::schema::{flatten_fields, InferredField, JsonType};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaFieldChange {
    pub path: String,
    pub left_types: Vec<JsonType>,
    pub right_types: Vec<JsonType>,
    pub left_nullable: bool,
    pub right_nullable: bool,
    pub left_occurrence_rate: f64,
    pub right_occurrence_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaDiff {
    pub added_fields: Vec<InferredField>,
    pub removed_fields: Vec<InferredField>,
    pub changed_fields: Vec<SchemaFieldChange>,
    pub left_record_count: u64,
    pub right_record_count: u64,
    pub left_only_keys: Vec<String>,
    pub right_only_keys: Vec<String>,
    pub shared_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordFieldChange {
    pub path: String,
    pub left: Option<Value>,
    pub right: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordDiff {
    pub key: String,
    pub status: RecordDiffStatus,
    pub changes: Vec<RecordFieldChange>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordDiffStatus {
    Added,
    Removed,
    Changed,
    Unchanged,
}

/// Per-field agreement across the records shared by both datasets.
/// This is the core LLM-comparison metric: for every field path, how often
/// did the two model outputs produce an identical value?
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldAgreement {
    pub path: String,
    pub agree: u64,
    pub disagree: u64,
    pub left_only: u64,
    pub right_only: u64,
    pub total: u64,
    pub agreement_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordDiffSummary {
    pub key_field: String,
    pub added: u64,
    pub removed: u64,
    pub changed: u64,
    pub unchanged: u64,
    /// Records present in both, used as the denominator for agreement.
    pub shared: u64,
    /// Overall value agreement rate across all compared leaf fields (0.0–1.0).
    pub overall_agreement: f64,
    pub field_agreement: Vec<FieldAgreement>,
    pub records: Vec<RecordDiff>,
    pub truncated: bool,
}

pub fn diff_schemas(left: &[InferredField], right: &[InferredField]) -> SchemaDiff {
    let left_flat = flatten_fields(left);
    let right_flat = flatten_fields(right);

    let left_keys: BTreeSet<_> = left_flat.keys().cloned().collect();
    let right_keys: BTreeSet<_> = right_flat.keys().cloned().collect();

    let added_keys: Vec<_> = right_keys.difference(&left_keys).cloned().collect();
    let removed_keys: Vec<_> = left_keys.difference(&right_keys).cloned().collect();
    let shared_keys: Vec<_> = left_keys.intersection(&right_keys).cloned().collect();

    let added_fields = added_keys
        .iter()
        .filter_map(|key| right_flat.get(key).cloned())
        .collect();
    let removed_fields = removed_keys
        .iter()
        .filter_map(|key| left_flat.get(key).cloned())
        .collect();

    let mut changed_fields = Vec::new();
    for key in &shared_keys {
        let left_field = left_flat.get(key).unwrap();
        let right_field = right_flat.get(key).unwrap();
        let types_differ = left_field.types != right_field.types;
        let nullability_differ = left_field.nullable != right_field.nullable;
        let left_rate = occurrence_rate(left_field);
        let right_rate = occurrence_rate(right_field);
        let rate_delta = (left_rate - right_rate).abs() > 0.05;

        if types_differ || nullability_differ || rate_delta {
            changed_fields.push(SchemaFieldChange {
                path: key.clone(),
                left_types: left_field.types.clone(),
                right_types: right_field.types.clone(),
                left_nullable: left_field.nullable,
                right_nullable: right_field.nullable,
                left_occurrence_rate: left_rate,
                right_occurrence_rate: right_rate,
            });
        }
    }

    SchemaDiff {
        added_fields,
        removed_fields,
        changed_fields,
        left_record_count: 0,
        right_record_count: 0,
        left_only_keys: removed_keys,
        right_only_keys: added_keys,
        shared_keys,
    }
}

pub fn diff_records(
    left: &Value,
    right: &Value,
    key_field: Option<&str>,
    max_records: usize,
) -> Result<RecordDiffSummary, String> {
    let left_records = records_as_map(left)?;
    let right_records = records_as_map(right)?;
    let key_field = key_field
        .map(str::to_string)
        .or_else(|| detect_key_field(&left_records, &right_records))
        .ok_or_else(|| {
            "Could not detect a stable key field. Pass key_field explicitly.".to_string()
        })?;

    let left_keys: BTreeSet<_> = left_records.keys().cloned().collect();
    let right_keys: BTreeSet<_> = right_records.keys().cloned().collect();

    let mut records = Vec::new();
    let mut added = 0u64;
    let mut removed = 0u64;
    let mut changed = 0u64;
    let mut unchanged = 0u64;
    let mut shared = 0u64;
    let mut agreement: BTreeMap<String, AgreementAccumulator> = BTreeMap::new();

    for key in right_keys.difference(&left_keys) {
        added += 1;
        if records.len() < max_records {
            records.push(RecordDiff {
                key: key.clone(),
                status: RecordDiffStatus::Added,
                changes: vec![],
            });
        }
    }

    for key in left_keys.difference(&right_keys) {
        removed += 1;
        if records.len() < max_records {
            records.push(RecordDiff {
                key: key.clone(),
                status: RecordDiffStatus::Removed,
                changes: vec![],
            });
        }
    }

    for key in left_keys.intersection(&right_keys) {
        let left_value = left_records.get(key).unwrap();
        let right_value = right_records.get(key).unwrap();
        shared += 1;
        accumulate_agreement(left_value, right_value, &mut agreement);
        let changes = diff_values("", left_value, right_value);
        if changes.is_empty() {
            unchanged += 1;
            if records.len() < max_records {
                records.push(RecordDiff {
                    key: key.clone(),
                    status: RecordDiffStatus::Unchanged,
                    changes,
                });
            }
        } else {
            changed += 1;
            if records.len() < max_records {
                records.push(RecordDiff {
                    key: key.clone(),
                    status: RecordDiffStatus::Changed,
                    changes,
                });
            }
        }
    }

    let mut field_agreement: Vec<FieldAgreement> = agreement
        .into_iter()
        .map(|(path, acc)| {
            let total = acc.agree + acc.disagree + acc.left_only + acc.right_only;
            FieldAgreement {
                path,
                agree: acc.agree,
                disagree: acc.disagree,
                left_only: acc.left_only,
                right_only: acc.right_only,
                total,
                agreement_rate: if total == 0 {
                    1.0
                } else {
                    acc.agree as f64 / total as f64
                },
            }
        })
        .collect();
    // Most divergent fields first — that's what an evaluator wants to see.
    field_agreement.sort_by(|a, b| {
        a.agreement_rate
            .partial_cmp(&b.agreement_rate)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let (agree_sum, total_sum) = field_agreement
        .iter()
        .fold((0u64, 0u64), |(a, t), f| (a + f.agree, t + f.total));
    let overall_agreement = if total_sum == 0 {
        1.0
    } else {
        agree_sum as f64 / total_sum as f64
    };

    let total_diffs = added + removed + changed + unchanged;
    Ok(RecordDiffSummary {
        key_field,
        added,
        removed,
        changed,
        unchanged,
        shared,
        overall_agreement,
        field_agreement,
        records,
        truncated: total_diffs as usize > max_records,
    })
}

#[derive(Default)]
struct AgreementAccumulator {
    agree: u64,
    disagree: u64,
    left_only: u64,
    right_only: u64,
}

/// Compare two records field-by-field at the leaf level and update the
/// per-path agreement tallies.
fn accumulate_agreement(
    left: &Value,
    right: &Value,
    out: &mut BTreeMap<String, AgreementAccumulator>,
) {
    let mut left_leaves: BTreeMap<String, &Value> = BTreeMap::new();
    let mut right_leaves: BTreeMap<String, &Value> = BTreeMap::new();
    flatten_leaves("", left, &mut left_leaves);
    flatten_leaves("", right, &mut right_leaves);

    let mut paths: BTreeSet<&String> = BTreeSet::new();
    paths.extend(left_leaves.keys());
    paths.extend(right_leaves.keys());

    for path in paths {
        let entry = out.entry(path.clone()).or_default();
        match (left_leaves.get(path), right_leaves.get(path)) {
            (Some(l), Some(r)) => {
                if l == r {
                    entry.agree += 1;
                } else {
                    entry.disagree += 1;
                }
            }
            (Some(_), None) => entry.left_only += 1,
            (None, Some(_)) => entry.right_only += 1,
            (None, None) => {}
        }
    }
}

/// Flatten a value to leaf paths. Arrays and scalars are treated as leaves so
/// that comparison stays meaningful for nested LLM outputs without exploding.
fn flatten_leaves<'a>(path: &str, value: &'a Value, out: &mut BTreeMap<String, &'a Value>) {
    match value {
        Value::Object(map) if !map.is_empty() => {
            for (key, child) in map {
                let child_path = if path.is_empty() {
                    key.clone()
                } else {
                    format!("{path}.{key}")
                };
                flatten_leaves(&child_path, child, out);
            }
        }
        _ => {
            out.insert(path.to_string(), value);
        }
    }
}

/// Find a single record by its key, using the same key-resolution rules as the
/// diff. Avoids cloning the whole collection — only the matched record.
pub fn find_record(root: &Value, key: &str, key_field: Option<&str>) -> Option<Value> {
    match root {
        Value::Array(items) => {
            if let Some(field) = key_field {
                for item in items {
                    if let Some(obj) = item.as_object() {
                        if let Some(found) = obj.get(field) {
                            if found.to_string() == key || scalar_string(found) == key {
                                return Some(item.clone());
                            }
                        }
                    }
                }
            }
            // Fall back to positional index (matches default keying).
            key.parse::<usize>().ok().and_then(|i| items.get(i).cloned())
        }
        Value::Object(map) => map.get(key).cloned(),
        _ => None,
    }
}

/// Distinct list of top-level field names across both datasets, suitable for a
/// "choose your key" selector in the UI.
pub fn candidate_key_fields(left: &Value, right: &Value) -> Vec<String> {
    let mut keys: BTreeSet<String> = BTreeSet::new();
    for root in [left, right] {
        if let Value::Array(items) = root {
            for item in items.iter().take(200) {
                if let Some(obj) = item.as_object() {
                    for key in obj.keys() {
                        keys.insert(key.clone());
                    }
                }
            }
        }
    }
    keys.into_iter().collect()
}

fn scalar_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn occurrence_rate(field: &InferredField) -> f64 {
    if field.total_samples == 0 {
        0.0
    } else {
        field.occurrence_count as f64 / field.total_samples as f64
    }
}

fn records_as_map(value: &Value) -> Result<BTreeMap<String, Value>, String> {
    match value {
        Value::Array(items) => {
            let mut map = BTreeMap::new();
            for (index, item) in items.iter().enumerate() {
                let key = extract_record_key(item).unwrap_or_else(|| index.to_string());
                map.insert(key, item.clone());
            }
            Ok(map)
        }
        Value::Object(map) => {
            if map.values().all(|v| v.is_object() || v.is_array()) {
                Ok(map.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            } else {
                Err("Expected an array of objects or object keyed by record id".to_string())
            }
        }
        _ => Err("Expected an array or object collection".to_string()),
    }
}

fn extract_record_key(value: &Value) -> Option<String> {
    let obj = value.as_object()?;
    const CANDIDATES: [&str; 8] = [
        "id",
        "uuid",
        "platform_job_id",
        "job_id",
        "key",
        "_id",
        "slug",
        "external_id",
    ];
    for candidate in CANDIDATES {
        if let Some(found) = obj.get(candidate) {
            return Some(found.to_string());
        }
    }
    None
}

fn detect_key_field(
    left: &BTreeMap<String, Value>,
    right: &BTreeMap<String, Value>,
) -> Option<String> {
    let mut scores: HashMap<String, u32> = HashMap::new();
    for records in [left, right] {
        for record in records.values() {
            if let Some(obj) = record.as_object() {
                for key in obj.keys() {
                    *scores.entry(key.clone()).or_default() += 1;
                }
            }
        }
    }

    let preferred = [
        "platform_job_id",
        "id",
        "uuid",
        "job_id",
        "_id",
        "key",
        "slug",
    ];
    for candidate in preferred {
        if scores.contains_key(candidate) {
            return Some(candidate.to_string());
        }
    }

    scores
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(key, _)| key)
}

fn diff_values(path: &str, left: &Value, right: &Value) -> Vec<RecordFieldChange> {
    if left == right {
        return vec![];
    }

    match (left, right) {
        (Value::Object(left_map), Value::Object(right_map)) => {
            let left_keys: BTreeSet<_> = left_map.keys().collect();
            let right_keys: BTreeSet<_> = right_map.keys().collect();
            let mut changes = Vec::new();

            for key in left_keys.union(&right_keys) {
                let child_path = if path.is_empty() {
                    (*key).clone()
                } else {
                    format!("{path}.{key}")
                };
                match (left_map.get(*key), right_map.get(*key)) {
                    (Some(l), Some(r)) => changes.extend(diff_values(&child_path, l, r)),
                    (Some(l), None) => changes.push(RecordFieldChange {
                        path: child_path,
                        left: Some(l.clone()),
                        right: None,
                    }),
                    (None, Some(r)) => changes.push(RecordFieldChange {
                        path: child_path,
                        left: None,
                        right: Some(r.clone()),
                    }),
                    (None, None) => {}
                }
            }
            changes
        }
        (Value::Array(left_items), Value::Array(right_items)) => {
            if left_items.len() != right_items.len() {
                vec![RecordFieldChange {
                    path: path.to_string(),
                    left: Some(left.clone()),
                    right: Some(right.clone()),
                }]
            } else {
                let mut changes = Vec::new();
                for (index, (l, r)) in left_items.iter().zip(right_items.iter()).enumerate() {
                    let child_path = format!("{path}[{index}]");
                    changes.extend(diff_values(&child_path, l, r));
                }
                if changes.is_empty() && left != right {
                    changes.push(RecordFieldChange {
                        path: path.to_string(),
                        left: Some(left.clone()),
                        right: Some(right.clone()),
                    });
                }
                changes
            }
        }
        _ => vec![RecordFieldChange {
            path: path.to_string(),
            left: Some(left.clone()),
            right: Some(right.clone()),
        }],
    }
}
