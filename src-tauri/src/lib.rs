mod state;

use json_vis_core::{
    build_graph, candidate_key_fields, diff_records, diff_schemas, expand_path, find_record,
    list_children, run_query, value_at, ChildrenSlice, DocumentMeta, GraphSnapshot, InferredSchema,
    QueryResult, RecordDiffSummary, SchemaDiff, DEFAULT_EXPAND_DEPTH, DEFAULT_PAGE_SIZE,
    MAX_SLICE_NODES,
};
use serde::Serialize;
use serde_json::Value;
use state::{AppState, StoredDocument};
use std::fs;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileLoadError {
    name: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenFilesResult {
    opened: Vec<DocumentMeta>,
    errors: Vec<FileLoadError>,
}

#[tauri::command]
fn list_documents(state: State<'_, AppState>) -> Vec<DocumentMeta> {
    state
        .documents
        .lock()
        .unwrap()
        .values()
        .map(|doc| doc.meta())
        .collect()
}

#[tauri::command]
fn open_json_files(paths: Vec<String>, state: State<'_, AppState>) -> OpenFilesResult {
    let mut opened = Vec::new();
    let mut errors = Vec::new();
    let mut store = state.documents.lock().unwrap();

    for path in paths {
        let name = std::path::Path::new(&path)
            .file_name()
            .and_then(|part| part.to_str())
            .unwrap_or("document.json")
            .to_string();

        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(err) => {
                errors.push(FileLoadError {
                    name: name.clone(),
                    message: format!("could not read file: {err}"),
                });
                continue;
            }
        };

        let id = uuid::Uuid::new_v4().to_string();
        match StoredDocument::from_bytes(id.clone(), name.clone(), bytes) {
            Ok(document) => {
                let meta = document.meta();
                store.insert(id, document);
                opened.push(meta);
            }
            Err(err) => {
                errors.push(FileLoadError {
                    name,
                    message: err,
                });
            }
        }
    }

    OpenFilesResult { opened, errors }
}

#[tauri::command]
fn load_json_text(name: String, text: String, state: State<'_, AppState>) -> Result<DocumentMeta, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let document = StoredDocument::from_bytes(id.clone(), name, text.into_bytes())?;
    let meta = document.meta();
    state.documents.lock().unwrap().insert(id, document);
    Ok(meta)
}

#[tauri::command]
fn close_document(document_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .documents
        .lock()
        .unwrap()
        .remove(&document_id)
        .ok_or_else(|| format!("Document {document_id} not found"))?;
    Ok(())
}

#[tauri::command]
fn get_schema(document_id: String, state: State<'_, AppState>) -> Result<InferredSchema, String> {
    let store = state.documents.lock().unwrap();
    let document = store
        .get(&document_id)
        .ok_or_else(|| format!("Document {document_id} not found"))?;
    Ok(document.schema.clone())
}

#[tauri::command]
async fn get_graph(
    document_id: String,
    max_nodes: Option<u32>,
    expand_depth: Option<u32>,
    state: State<'_, AppState>,
) -> Result<GraphSnapshot, String> {
    let value = {
        let store = state.documents.lock().unwrap();
        let document = store
            .get(&document_id)
            .ok_or_else(|| format!("Document {document_id} not found"))?;
        document.value.clone()
    };
    let max_nodes = max_nodes.unwrap_or(MAX_SLICE_NODES);
    let expand_depth = expand_depth.unwrap_or(DEFAULT_EXPAND_DEPTH);
    tauri::async_runtime::spawn_blocking(move || build_graph(&value, max_nodes, expand_depth))
        .await
        .map_err(|err| format!("graph task failed: {err}"))
}

#[tauri::command]
async fn expand_graph_path(
    document_id: String,
    path: String,
    max_nodes: Option<u32>,
    state: State<'_, AppState>,
) -> Result<GraphSnapshot, String> {
    let value = {
        let store = state.documents.lock().unwrap();
        let document = store
            .get(&document_id)
            .ok_or_else(|| format!("Document {document_id} not found"))?;
        document.value.clone()
    };
    let max_nodes = max_nodes.unwrap_or(MAX_SLICE_NODES);
    tauri::async_runtime::spawn_blocking(move || expand_path(&value, &path, max_nodes))
        .await
        .map_err(|err| format!("expand task failed: {err}"))
}

#[tauri::command]
async fn list_children(
    document_id: String,
    path: String,
    offset: Option<u32>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<ChildrenSlice, String> {
    let value = {
        let store = state.documents.lock().unwrap();
        let document = store
            .get(&document_id)
            .ok_or_else(|| format!("Document {document_id} not found"))?;
        document.value.clone()
    };
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE).min(MAX_SLICE_NODES);
    tauri::async_runtime::spawn_blocking(move || list_children(&value, &path, offset, limit))
        .await
        .map_err(|err| format!("list children task failed: {err}"))
}

#[tauri::command]
fn compare_schemas(
    left_id: String,
    right_id: String,
    state: State<'_, AppState>,
) -> Result<SchemaDiff, String> {
    let store = state.documents.lock().unwrap();
    let left = store
        .get(&left_id)
        .ok_or_else(|| format!("Document {left_id} not found"))?;
    let right = store
        .get(&right_id)
        .ok_or_else(|| format!("Document {right_id} not found"))?;

    let mut diff = diff_schemas(&left.schema.fields, &right.schema.fields);
    diff.left_record_count = left.schema.record_count;
    diff.right_record_count = right.schema.record_count;
    Ok(diff)
}

#[tauri::command]
fn compare_records(
    left_id: String,
    right_id: String,
    key_field: Option<String>,
    max_records: Option<usize>,
    state: State<'_, AppState>,
) -> Result<RecordDiffSummary, String> {
    let store = state.documents.lock().unwrap();
    let left = store
        .get(&left_id)
        .ok_or_else(|| format!("Document {left_id} not found"))?;
    let right = store
        .get(&right_id)
        .ok_or_else(|| format!("Document {right_id} not found"))?;

    diff_records(
        &left.value,
        &right.value,
        key_field.as_deref(),
        max_records.unwrap_or(MAX_SLICE_NODES as usize),
    )
}

#[tauri::command]
fn get_value(
    document_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let store = state.documents.lock().unwrap();
    let document = store
        .get(&document_id)
        .ok_or_else(|| format!("Document {document_id} not found"))?;
    Ok(value_at(&document.value, &path).clone())
}

#[tauri::command]
fn get_record(
    document_id: String,
    key: String,
    key_field: Option<String>,
    state: State<'_, AppState>,
) -> Result<Option<Value>, String> {
    let store = state.documents.lock().unwrap();
    let document = store
        .get(&document_id)
        .ok_or_else(|| format!("Document {document_id} not found"))?;
    Ok(find_record(&document.value, &key, key_field.as_deref()))
}

#[tauri::command]
fn key_field_candidates(
    left_id: String,
    right_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let store = state.documents.lock().unwrap();
    let left = store
        .get(&left_id)
        .ok_or_else(|| format!("Document {left_id} not found"))?;
    let right = store
        .get(&right_id)
        .ok_or_else(|| format!("Document {right_id} not found"))?;
    Ok(candidate_key_fields(&left.value, &right.value))
}

#[tauri::command]
fn query_document(
    document_id: String,
    query: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<QueryResult, String> {
    let store = state.documents.lock().unwrap();
    let document = store
        .get(&document_id)
        .ok_or_else(|| format!("Document {document_id} not found"))?;
    run_query(
        &document.value,
        &query,
        limit.unwrap_or(MAX_SLICE_NODES as usize),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_documents,
            open_json_files,
            load_json_text,
            close_document,
            get_schema,
            get_graph,
            expand_graph_path,
            list_children,
            compare_schemas,
            compare_records,
            query_document,
            get_value,
            get_record,
            key_field_candidates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
