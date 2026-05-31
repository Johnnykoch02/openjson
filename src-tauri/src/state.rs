use json_vis_core::{DocumentMeta, ParsedDocument};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct StoredDocument {
    pub parsed: ParsedDocument,
}

impl StoredDocument {
    pub fn from_bytes(id: String, name: String, bytes: Vec<u8>) -> Result<Self, String> {
        Ok(Self {
            parsed: ParsedDocument::parse(id, name, bytes)?,
        })
    }

    pub fn meta(&self) -> DocumentMeta {
        self.parsed.meta()
    }
}

impl std::ops::Deref for StoredDocument {
    type Target = ParsedDocument;

    fn deref(&self) -> &Self::Target {
        &self.parsed
    }
}

#[derive(Default)]
pub struct AppState {
    pub documents: Mutex<HashMap<String, StoredDocument>>,
}
