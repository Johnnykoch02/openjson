use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JsonType {
    Null,
    Boolean,
    Integer,
    Number,
    String,
    Array,
    Object,
}

impl JsonType {
    pub fn from_value(value: &serde_json::Value) -> Self {
        match value {
            serde_json::Value::Null => Self::Null,
            serde_json::Value::Bool(_) => Self::Boolean,
            serde_json::Value::Number(n) => {
                if n.is_i64() || n.is_u64() {
                    Self::Integer
                } else {
                    Self::Number
                }
            }
            serde_json::Value::String(_) => Self::String,
            serde_json::Value::Array(_) => Self::Array,
            serde_json::Value::Object(_) => Self::Object,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferredField {
    pub path: String,
    pub name: String,
    pub types: Vec<JsonType>,
    pub nullable: bool,
    pub occurrence_count: u64,
    pub total_samples: u64,
    pub array_length_min: Option<u64>,
    pub array_length_max: Option<u64>,
    pub sample_values: Vec<String>,
    pub nested_fields: Vec<InferredField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferredSchema {
    pub root_type: JsonType,
    pub record_count: u64,
    pub byte_size: u64,
    pub fields: Vec<InferredField>,
    pub top_level_keys: Vec<String>,
}

#[derive(Debug, Default)]
struct FieldAccumulator {
    types: BTreeSet<JsonType>,
    occurrence_count: u64,
    null_count: u64,
    array_lengths: Vec<u64>,
    sample_values: Vec<String>,
    nested: HashMap<String, FieldAccumulator>,
}

impl FieldAccumulator {
    fn observe_value(&mut self, value: &serde_json::Value) {
        self.occurrence_count += 1;
        if value.is_null() {
            self.null_count += 1;
            self.types.insert(JsonType::Null);
            return;
        }

        let kind = JsonType::from_value(value);
        self.types.insert(kind);

        match value {
            serde_json::Value::Array(items) => {
                self.array_lengths.push(items.len() as u64);
                for item in items.iter().take(5) {
                    let nested = self.nested.entry("[item]".to_string()).or_default();
                    nested.observe_value(item);
                }
            }
            serde_json::Value::Object(map) => {
                for (key, child) in map {
                    let nested = self.nested.entry(key.clone()).or_default();
                    nested.observe_value(child);
                }
            }
            _ => {
                if self.sample_values.len() < 5 {
                    let sample = truncate_sample(value);
                    if !self.sample_values.contains(&sample) {
                        self.sample_values.push(sample);
                    }
                }
            }
        }
    }

    fn into_field(
        self,
        path: &str,
        name: &str,
        total_samples: u64,
    ) -> InferredField {
        let (array_length_min, array_length_max) = if self.array_lengths.is_empty() {
            (None, None)
        } else {
            (
                Some(*self.array_lengths.iter().min().unwrap()),
                Some(*self.array_lengths.iter().max().unwrap()),
            )
        };

        let nested_fields = self
            .nested
            .into_iter()
            .map(|(key, acc)| {
                let child_path = if path.is_empty() {
                    key.clone()
                } else if key == "[item]" {
                    format!("{path}[]")
                } else {
                    format!("{path}.{key}")
                };
                acc.into_field(&child_path, &key, total_samples)
            })
            .collect();

        InferredField {
            path: path.to_string(),
            name: name.to_string(),
            types: self.types.into_iter().collect(),
            nullable: self.null_count > 0,
            occurrence_count: self.occurrence_count,
            total_samples,
            array_length_min,
            array_length_max,
            sample_values: self.sample_values,
            nested_fields,
        }
    }
}

fn truncate_sample(value: &serde_json::Value) -> String {
    let raw = match value {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    crate::util::truncate_chars(&raw, 117)
}

pub fn infer_schema(value: &serde_json::Value, byte_size: u64) -> InferredSchema {
    match value {
        serde_json::Value::Array(items) => {
            let record_count = items.len() as u64;
            let mut root = FieldAccumulator::default();
            for item in items {
                root.observe_value(item);
            }
            let fields: Vec<InferredField> = root
                .nested
                .into_iter()
                .map(|(key, acc)| acc.into_field(&key, &key, record_count))
                .collect();

            let mut top_level_keys: Vec<String> = fields.iter().map(|f| f.name.clone()).collect();
            top_level_keys.sort();

            InferredSchema {
                root_type: JsonType::Array,
                record_count,
                byte_size,
                fields,
                top_level_keys,
            }
        }
        serde_json::Value::Object(map) => {
            let record_count = 1;
            let mut root = FieldAccumulator::default();
            root.observe_value(value);
            let fields: Vec<InferredField> = root
                .nested
                .into_iter()
                .map(|(key, acc)| acc.into_field(&key, &key, record_count))
                .collect();

            let mut top_level_keys: Vec<String> = map.keys().cloned().collect();
            top_level_keys.sort();

            InferredSchema {
                root_type: JsonType::Object,
                record_count,
                byte_size,
                fields,
                top_level_keys,
            }
        }
        other => InferredSchema {
            root_type: JsonType::from_value(other),
            record_count: 1,
            byte_size,
            fields: vec![],
            top_level_keys: vec![],
        },
    }
}

pub fn flatten_fields(fields: &[InferredField]) -> IndexMap<String, InferredField> {
    let mut out = IndexMap::new();
    flatten_fields_inner(fields, &mut out);
    out
}

fn flatten_fields_inner(fields: &[InferredField], out: &mut IndexMap<String, InferredField>) {
    for field in fields {
        out.insert(field.path.clone(), field.clone());
        flatten_fields_inner(&field.nested_fields, out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn infers_array_of_objects() {
        let value = json!([
            {"id": 1, "name": "Alice", "tags": ["a", "b"]},
            {"id": 2, "name": "Bob", "tags": null},
        ]);
        let schema = infer_schema(&value, 100);
        assert_eq!(schema.root_type, JsonType::Array);
        assert_eq!(schema.record_count, 2);
        assert!(schema.fields.iter().any(|f| f.name == "id"));
        assert!(schema.fields.iter().any(|f| f.name == "tags" && f.nullable));
    }

    #[test]
    fn infers_array_of_objects_with_unicode_samples() {
        let value = json!([
            {"title": "日本語・エンジニア / Japanese Engineer"},
            {"title": "Staff Platform Engineer"},
        ]);
        let schema = infer_schema(&value, 100);
        assert_eq!(schema.record_count, 2);
        let title = schema.fields.iter().find(|f| f.name == "title").unwrap();
        assert!(!title.sample_values.is_empty());
    }
}
