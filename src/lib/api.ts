import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  DocumentMeta,
  GraphSnapshot,
  InferredSchema,
  QueryResult,
  RecordDiffSummary,
  SchemaDiff,
} from "../types";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let browserApi: typeof import("./browser-api") | null = null;

async function getBrowserApi() {
  if (!browserApi) {
    browserApi = await import("./browser-api");
  }
  return browserApi;
}

export async function pickAndOpenFiles(): Promise<DocumentMeta[]> {
  if (isTauri()) {
    const selected = await open({
      multiple: true,
      filters: [{ name: "JSON", extensions: ["json", "jsonl", "ndjson"] }],
    });
    if (!selected) return [];
    const paths = Array.isArray(selected) ? selected : [selected];
    return invoke<DocumentMeta[]>("open_json_files", { paths });
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".json,.jsonl,.ndjson,application/json";
    input.onchange = async () => {
      const api = await getBrowserApi();
      const files = Array.from(input.files ?? []);
      const opened = await Promise.all(
        files.map((file) => api.loadFile(file)),
      );
      resolve(opened);
    };
    input.click();
  });
}

export async function loadJsonText(name: string, text: string): Promise<DocumentMeta> {
  if (isTauri()) {
    return invoke<DocumentMeta>("load_json_text", { name, text });
  }
  const api = await getBrowserApi();
  return api.loadText(name, text);
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  if (isTauri()) {
    return invoke<DocumentMeta[]>("list_documents");
  }
  const api = await getBrowserApi();
  return api.listDocuments();
}

export async function closeDocument(documentId: string): Promise<void> {
  if (isTauri()) {
    return invoke("close_document", { documentId });
  }
  const api = await getBrowserApi();
  return api.closeDocument(documentId);
}

export async function getSchema(documentId: string): Promise<InferredSchema> {
  if (isTauri()) {
    return invoke<InferredSchema>("get_schema", { documentId });
  }
  const api = await getBrowserApi();
  return api.getSchema(documentId);
}

export async function getGraph(
  documentId: string,
  maxNodes = 250,
  expandDepth = 2,
): Promise<GraphSnapshot> {
  if (isTauri()) {
    return invoke<GraphSnapshot>("get_graph", {
      documentId,
      maxNodes,
      expandDepth,
    });
  }
  const api = await getBrowserApi();
  return api.getGraph(documentId, maxNodes, expandDepth);
}

export async function expandGraphPath(
  documentId: string,
  path: string,
  maxNodes = 250,
): Promise<GraphSnapshot> {
  if (isTauri()) {
    return invoke<GraphSnapshot>("expand_graph_path", {
      documentId,
      path,
      maxNodes,
    });
  }
  const api = await getBrowserApi();
  return api.expandPath(documentId, path, maxNodes);
}

export async function queryDocument(
  documentId: string,
  query: string,
  limit = 500,
): Promise<QueryResult> {
  if (isTauri()) {
    return invoke<QueryResult>("query_document", { documentId, query, limit });
  }
  const api = await getBrowserApi();
  return api.runQuery(documentId, query, limit);
}

export async function compareSchemas(
  leftId: string,
  rightId: string,
): Promise<SchemaDiff> {
  if (isTauri()) {
    return invoke<SchemaDiff>("compare_schemas", { leftId, rightId });
  }
  const api = await getBrowserApi();
  return api.compareSchemas(leftId, rightId);
}

export async function compareRecords(
  leftId: string,
  rightId: string,
  keyField?: string,
  maxRecords = 500,
): Promise<RecordDiffSummary> {
  if (isTauri()) {
    return invoke<RecordDiffSummary>("compare_records", {
      leftId,
      rightId,
      keyField,
      maxRecords,
    });
  }
  const api = await getBrowserApi();
  return api.compareRecords(leftId, rightId, keyField, maxRecords);
}

export async function getValue(documentId: string, path: string): Promise<unknown> {
  if (isTauri()) {
    return invoke<unknown>("get_value", { documentId, path });
  }
  const api = await getBrowserApi();
  return api.getValue(documentId, path);
}

export async function getRecord(
  documentId: string,
  key: string,
  keyField?: string,
): Promise<unknown> {
  if (isTauri()) {
    return invoke<unknown>("get_record", { documentId, key, keyField });
  }
  const api = await getBrowserApi();
  return api.getRecord(documentId, key, keyField);
}

export async function keyFieldCandidates(
  leftId: string,
  rightId: string,
): Promise<string[]> {
  if (isTauri()) {
    return invoke<string[]>("key_field_candidates", { leftId, rightId });
  }
  const api = await getBrowserApi();
  return api.keyFieldCandidates(leftId, rightId);
}

export async function openExternal(url: string): Promise<void> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  if (isTauri()) {
    await openUrl(target);
    return;
  }
  window.open(target, "_blank", "noopener,noreferrer");
}

export function formatBytes(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${size} ${units[unit]}` : `${value.toFixed(1)} ${units[unit]}`;
}
