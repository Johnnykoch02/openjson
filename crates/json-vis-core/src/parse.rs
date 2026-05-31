use crate::schema::{infer_schema, InferredSchema};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMeta {
    pub id: String,
    pub name: String,
    pub byte_size: u64,
    pub root_type: String,
    pub record_count: u64,
    pub top_level_keys: Vec<String>,
}

#[derive(Debug)]
pub struct ParsedDocument {
    pub id: String,
    pub name: String,
    pub bytes: Vec<u8>,
    pub value: Value,
    pub schema: InferredSchema,
}

impl ParsedDocument {
    pub fn parse(id: String, name: String, bytes: Vec<u8>) -> Result<Self, String> {
        let byte_size = bytes.len() as u64;
        let lower = name.to_lowercase();
        let prefer_ndjson = lower.ends_with(".jsonl") || lower.ends_with(".ndjson");

        let value: Value = if prefer_ndjson {
            parse_ndjson(&bytes)?
        } else {
            let mut buffer = bytes.clone();
            match simd_json::from_slice(&mut buffer) {
                Ok(value) => value,
                // Fall back to NDJSON for files that are line-delimited but
                // not marked with a .jsonl extension (common for LLM logs).
                Err(err) => parse_ndjson(&bytes).map_err(|_| format!("Invalid JSON: {err}"))?,
            }
        };

        let schema = infer_schema(&value, byte_size);

        Ok(Self {
            id,
            name,
            bytes,
            value,
            schema,
        })
    }

    pub fn meta(&self) -> DocumentMeta {
        DocumentMeta {
            id: self.id.clone(),
            name: self.name.clone(),
            byte_size: self.schema.byte_size,
            root_type: serde_json::to_value(self.schema.root_type)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_else(|| "unknown".to_string()),
            record_count: self.schema.record_count,
            top_level_keys: self.schema.top_level_keys.clone(),
        }
    }
}

/// Parse newline-delimited JSON (JSONL/NDJSON) into a single array value.
fn parse_ndjson(bytes: &[u8]) -> Result<Value, String> {
    let text = std::str::from_utf8(bytes).map_err(|err| format!("Invalid UTF-8: {err}"))?;
    let mut items = Vec::new();
    for (line_no, line) in text.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value: Value = serde_json::from_str(trimmed)
            .map_err(|err| format!("NDJSON parse error on line {}: {err}", line_no + 1))?;
        items.push(value);
    }
    if items.is_empty() {
        return Err("No JSON records found".to_string());
    }
    Ok(Value::Array(items))
}

pub fn format_bytes(size: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = size as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{} {}", size, UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}
