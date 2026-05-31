import type {
  DocumentMeta,
  FieldAgreement,
  GraphSnapshot,
  InferredField,
  InferredSchema,
  JsonType,
  QueryResult,
  RecordDiff,
  RecordDiffSummary,
  SchemaDiff,
} from "../types";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface StoredDoc {
  id: string;
  name: string;
  value: JsonValue;
  schema: InferredSchema;
}

const documents = new Map<string, StoredDoc>();

function jsonType(value: JsonValue): JsonType {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (Number.isInteger(value)) return "integer";
  return "number";
}

function inferSchema(value: JsonValue, byteSize: number): InferredSchema {
  if (Array.isArray(value)) {
    const fields = inferFieldsFromRecords(value);
    return {
      root_type: "array",
      record_count: value.length,
      byte_size: byteSize,
      fields,
      top_level_keys: fields.map((f) => f.name).sort(),
    };
  }

  if (value && typeof value === "object") {
    const fields = inferObjectFields(value as Record<string, JsonValue>, "", 1);
    return {
      root_type: "object",
      record_count: 1,
      byte_size: byteSize,
      fields,
      top_level_keys: Object.keys(value as object).sort(),
    };
  }

  return {
    root_type: jsonType(value),
    record_count: 1,
    byte_size: byteSize,
    fields: [],
    top_level_keys: [],
  };
}

function inferFieldsFromRecords(records: JsonValue[]): InferredField[] {
  const acc = new Map<string, FieldAcc>();
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    for (const [key, val] of Object.entries(record)) {
      const field = acc.get(key) ?? new FieldAcc();
      field.observe(val);
      acc.set(key, field);
    }
  }
  return [...acc.entries()]
    .map(([name, field]) => field.toField(name, name, records.length))
    .sort((a, b) => a.name.localeCompare(b.name));
}

class FieldAcc {
  types = new Set<JsonType>();
  occurrenceCount = 0;
  nullCount = 0;
  samples: string[] = [];
  nested = new Map<string, FieldAcc>();

  observe(value: JsonValue) {
    this.occurrenceCount += 1;
    if (value === null) {
      this.nullCount += 1;
      this.types.add("null");
      return;
    }
    this.types.add(jsonType(value));
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        for (const item of value.slice(0, 5)) {
          const nested = this.nested.get("[item]") ?? new FieldAcc();
          nested.observe(item);
          this.nested.set("[item]", nested);
        }
      } else {
        for (const [key, child] of Object.entries(value)) {
          const nested = this.nested.get(key) ?? new FieldAcc();
          nested.observe(child);
          this.nested.set(key, nested);
        }
      }
    } else if (this.samples.length < 5) {
      const sample = truncate(String(value));
      if (!this.samples.includes(sample)) this.samples.push(sample);
    }
  }

  toField(path: string, name: string, total: number): InferredField {
    return {
      path,
      name,
      types: [...this.types],
      nullable: this.nullCount > 0,
      occurrence_count: this.occurrenceCount,
      total_samples: total,
      sample_values: this.samples,
      nested_fields: [...this.nested.entries()].map(([key, acc]) => {
        const childPath = key === "[item]" ? `${path}[]` : `${path}.${key}`;
        return acc.toField(childPath, key, total);
      }),
    };
  }
}

function inferObjectFields(
  obj: Record<string, JsonValue>,
  prefix: string,
  total: number,
): InferredField[] {
  return Object.entries(obj).map(([key, value]) => {
    const acc = new FieldAcc();
    acc.observe(value);
    const path = prefix ? `${prefix}.${key}` : key;
    return acc.toField(path, key, total);
  });
}

function truncate(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}…` : value;
}

function parseDocument(name: string, text: string): JsonValue {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) {
    return parseNdjson(text);
  }
  try {
    return JSON.parse(text) as JsonValue;
  } catch (err) {
    try {
      return parseNdjson(text);
    } catch {
      throw err;
    }
  }
}

function parseNdjson(text: string): JsonValue {
  const items: JsonValue[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed) items.push(JSON.parse(trimmed) as JsonValue);
  });
  if (items.length === 0) throw new Error("No JSON records found");
  return items;
}

function store(name: string, text: string): DocumentMeta {
  const bytes = new TextEncoder().encode(text);
  const value = parseDocument(name, text);
  const id = crypto.randomUUID();
  const schema = inferSchema(value, bytes.byteLength);
  const doc: StoredDoc = { id, name, value, schema };
  documents.set(id, doc);
  return toMeta(doc);
}

function toMeta(doc: StoredDoc): DocumentMeta {
  return {
    id: doc.id,
    name: doc.name,
    byte_size: doc.schema.byte_size,
    root_type: doc.schema.root_type,
    record_count: doc.schema.record_count,
    top_level_keys: doc.schema.top_level_keys,
  };
}

export async function loadFile(file: File): Promise<DocumentMeta> {
  const text = await file.text();
  return store(file.name, text);
}

export async function loadText(name: string, text: string): Promise<DocumentMeta> {
  return store(name, text);
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  return [...documents.values()].map(toMeta);
}

export async function closeDocument(documentId: string): Promise<void> {
  documents.delete(documentId);
}

export async function getSchema(documentId: string): Promise<InferredSchema> {
  const doc = documents.get(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  return doc.schema;
}

export async function getGraph(
  documentId: string,
  maxNodes = 250,
  expandDepth = 2,
): Promise<GraphSnapshot> {
  const doc = documents.get(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  return buildGraph(doc.value, maxNodes, expandDepth);
}

export async function expandPath(
  documentId: string,
  path: string,
  maxNodes = 250,
): Promise<GraphSnapshot> {
  const doc = documents.get(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  const target = resolvePath(doc.value, path);
  const nodes: GraphSnapshot["nodes"] = [];
  const edges: GraphSnapshot["edges"] = [];
  const nodeId = path === "" ? "root" : path.replace(/[.[\]]/g, "_");
  nodes.push(
    makeNode(
      nodeId,
      path === "" ? rootLabel(target) : path.split(".").pop() ?? path,
      path === "" ? "root" : kindFor(target),
      path,
      target,
    ),
  );
  let count = 0;
  let truncated = false;
  walk(target, nodeId, path, 1, maxNodes, nodes, edges, () => {
    count += 1;
    if (count >= maxNodes) truncated = true;
    return count >= maxNodes;
  });
  return { nodes, edges, truncated, total_nodes: nodes.length };
}

export async function runQuery(
  documentId: string,
  query: string,
  limit = 500,
): Promise<QueryResult> {
  const doc = documents.get(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  const steps = parseQuery(query);
  let current: Array<[string, JsonValue]> = [["", doc.value]];
  for (const step of steps) {
    const next: Array<[string, JsonValue]> = [];
    for (const [path, value] of current) applyStep(step, path, value, next);
    current = next;
    if (current.length === 0) break;
  }
  const total = current.length;
  const counts = new Map<string, number>();
  for (const [, value] of current) {
    const t = jsonType(value);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return {
    total,
    truncated: total > limit,
    type_breakdown: [...counts.entries()].sort(),
    matches: current.slice(0, limit).map(([path, value]) => ({
      path: path === "" ? "$" : path,
      value,
      type_name: jsonType(value),
    })),
  };
}

type Step =
  | { kind: "key"; key: string }
  | { kind: "index"; index: number }
  | { kind: "wildcard" }
  | { kind: "recursive" };

function parseQuery(query: string): Step[] {
  const body = query.trim().replace(/^\$/, "");
  const steps: Step[] = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === ".") {
      if (body[i + 1] === ".") {
        steps.push({ kind: "recursive" });
        i += 2;
      } else {
        i += 1;
      }
    } else if (ch === "*") {
      steps.push({ kind: "wildcard" });
      i += 1;
    } else if (ch === "[") {
      const close = body.indexOf("]", i);
      if (close === -1) throw new Error("Unbalanced '[' in query");
      const inner = body.slice(i + 1, close).trim();
      if (inner === "*") steps.push({ kind: "wildcard" });
      else if (/^['"].*['"]$/.test(inner)) steps.push({ kind: "key", key: inner.slice(1, -1) });
      else if (/^-?\d+$/.test(inner)) steps.push({ kind: "index", index: Number(inner) });
      else steps.push({ kind: "key", key: inner });
      i = close + 1;
    } else {
      let j = i;
      while (j < body.length && body[j] !== "." && body[j] !== "[" && body[j] !== "*") j += 1;
      const key = body.slice(i, j);
      if (key) steps.push({ kind: "key", key });
      i = j;
    }
  }
  return steps;
}

function applyStep(step: Step, path: string, value: JsonValue, out: Array<[string, JsonValue]>) {
  switch (step.kind) {
    case "key":
      if (value && typeof value === "object" && !Array.isArray(value) && step.key in value) {
        out.push([joinKey(path, step.key), (value as Record<string, JsonValue>)[step.key]]);
      }
      break;
    case "index":
      if (Array.isArray(value)) {
        const real = step.index < 0 ? value.length + step.index : step.index;
        if (real >= 0 && real < value.length) out.push([`${path}[${real}]`, value[real]]);
      }
      break;
    case "wildcard":
      if (Array.isArray(value)) value.forEach((v, idx) => out.push([`${path}[${idx}]`, v]));
      else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) out.push([joinKey(path, k), v]);
      break;
    case "recursive":
      collectDescendants(path, value, out);
      break;
  }
}

function collectDescendants(path: string, value: JsonValue, out: Array<[string, JsonValue]>) {
  out.push([path, value]);
  if (Array.isArray(value)) value.forEach((v, idx) => collectDescendants(`${path}[${idx}]`, v, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) collectDescendants(joinKey(path, k), v, out);
}

function joinKey(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

export async function getValue(documentId: string, path: string): Promise<JsonValue> {
  const doc = documents.get(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  return resolvePath(doc.value, path);
}

export async function getRecord(
  documentId: string,
  key: string,
  keyField?: string,
): Promise<JsonValue | null> {
  const doc = documents.get(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  if (Array.isArray(doc.value)) {
    if (keyField) {
      for (const item of doc.value) {
        if (item && typeof item === "object" && !Array.isArray(item) && keyField in item) {
          if (String((item as Record<string, JsonValue>)[keyField]) === key) return item;
        }
      }
    }
    const index = Number(key);
    return Number.isInteger(index) ? doc.value[index] ?? null : null;
  }
  if (doc.value && typeof doc.value === "object") {
    return (doc.value as Record<string, JsonValue>)[key] ?? null;
  }
  return null;
}

export async function keyFieldCandidates(leftId: string, rightId: string): Promise<string[]> {
  const keys = new Set<string>();
  for (const id of [leftId, rightId]) {
    const doc = documents.get(id);
    if (doc && Array.isArray(doc.value)) {
      for (const item of doc.value.slice(0, 200)) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          Object.keys(item).forEach((k) => keys.add(k));
        }
      }
    }
  }
  return [...keys].sort();
}

export async function compareSchemas(leftId: string, rightId: string): Promise<SchemaDiff> {
  const left = documents.get(leftId);
  const right = documents.get(rightId);
  if (!left || !right) throw new Error("Document not found");
  return diffSchemas(
    left.schema.fields,
    right.schema.fields,
    left.schema.record_count,
    right.schema.record_count,
  );
}

export async function compareRecords(
  leftId: string,
  rightId: string,
  keyField?: string,
  maxRecords = 500,
): Promise<RecordDiffSummary> {
  const left = documents.get(leftId);
  const right = documents.get(rightId);
  if (!left || !right) throw new Error("Document not found");
  return diffRecords(left.value, right.value, keyField, maxRecords);
}

function resolvePath(value: JsonValue, path: string): JsonValue {
  if (!path) return value;
  let current: JsonValue = value;
  const tokens = path.match(/[^.[\]]+/g) ?? [];
  for (const token of tokens) {
    if (current == null) return current;
    if (/^\d+$/.test(token) && Array.isArray(current)) current = current[Number(token)];
    else if (typeof current === "object" && !Array.isArray(current))
      current = (current as Record<string, JsonValue>)[token];
    else return current;
  }
  return current;
}

function buildGraph(value: JsonValue, maxNodes: number, expandDepth: number): GraphSnapshot {
  const nodes: GraphSnapshot["nodes"] = [];
  const edges: GraphSnapshot["edges"] = [];
  let count = 0;
  let truncated = false;

  nodes.push(makeNode("root", rootLabel(value), "root", "", value));
  walk(value, "root", "", expandDepth, maxNodes, nodes, edges, () => {
    count += 1;
    if (count >= maxNodes) truncated = true;
    return count >= maxNodes;
  });

  return { nodes, edges, truncated, total_nodes: nodes.length };
}

function walk(
  value: JsonValue,
  parentId: string,
  parentPath: string,
  depth: number,
  maxNodes: number,
  nodes: GraphSnapshot["nodes"],
  edges: GraphSnapshot["edges"],
  shouldStop: () => boolean,
) {
  if (depth <= 0) return;

  if (Array.isArray(value)) {
    for (const [index, child] of value.slice(0, 50).entries()) {
      if (shouldStop()) return;
      const path = `${parentPath}[${index}]`;
      const id = path.replace(/[.[\]]/g, "_");
      nodes.push(makeNode(id, `[${index}]`, "item", path, child));
      edges.push({ id: `${parentId}-${id}`, source: parentId, target: id, label: `[${index}]` });
      walk(child, id, path, depth - 1, maxNodes, nodes, edges, shouldStop);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (shouldStop()) return;
      const path = parentPath ? `${parentPath}.${key}` : key;
      const id = path.replace(/[.[\]]/g, "_");
      nodes.push(makeNode(id, key, "property", path, child));
      edges.push({ id: `${parentId}-${id}`, source: parentId, target: id, label: key });
      walk(child, id, path, depth - 1, maxNodes, nodes, edges, shouldStop);
    }
  }
}

function makeNode(
  id: string,
  label: string,
  kind: GraphSnapshot["nodes"][number]["kind"],
  path: string,
  value: JsonValue,
): GraphSnapshot["nodes"][number] {
  return {
    id,
    label,
    kind,
    path,
    value_preview: preview(value),
    child_count: childCount(value),
    expandable: typeof value === "object" && value !== null,
  };
}

function preview(value: JsonValue): string | null {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return value.length > 80 ? `"${value.slice(0, 77)}…"` : `"${value}"`;
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === "object") return `{${Object.keys(value).length} keys}`;
  return null;
}

function rootLabel(value: JsonValue): string {
  if (Array.isArray(value)) return `Array[${value.length}]`;
  if (value && typeof value === "object") return `Object{${Object.keys(value).length}}`;
  return preview(value) ?? "value";
}

function kindFor(value: JsonValue): GraphSnapshot["nodes"][number]["kind"] {
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return "number";
}

function childCount(value: JsonValue): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function flatten(fields: InferredField[]): Map<string, InferredField> {
  const out = new Map<string, InferredField>();
  const visit = (items: InferredField[]) => {
    for (const field of items) {
      out.set(field.path, field);
      visit(field.nested_fields);
    }
  };
  visit(fields);
  return out;
}

function diffSchemas(
  leftFields: InferredField[],
  rightFields: InferredField[],
  leftCount: number,
  rightCount: number,
): SchemaDiff {
  const left = flatten(leftFields);
  const right = flatten(rightFields);
  const leftKeys = new Set(left.keys());
  const rightKeys = new Set(right.keys());

  const added = [...rightKeys].filter((k) => !leftKeys.has(k));
  const removed = [...leftKeys].filter((k) => !rightKeys.has(k));
  const shared = [...leftKeys].filter((k) => rightKeys.has(k));

  const changed = shared.flatMap((path) => {
    const l = left.get(path)!;
    const r = right.get(path)!;
    const lr = l.occurrence_count / Math.max(l.total_samples, 1);
    const rr = r.occurrence_count / Math.max(r.total_samples, 1);
    if (
      JSON.stringify(l.types) === JSON.stringify(r.types) &&
      l.nullable === r.nullable &&
      Math.abs(lr - rr) <= 0.05
    ) {
      return [];
    }
    return [{
      path,
      left_types: l.types,
      right_types: r.types,
      left_nullable: l.nullable,
      right_nullable: r.nullable,
      left_occurrence_rate: lr,
      right_occurrence_rate: rr,
    }];
  });

  return {
    added_fields: added.map((path) => right.get(path)!),
    removed_fields: removed.map((path) => left.get(path)!),
    changed_fields: changed,
    left_record_count: leftCount,
    right_record_count: rightCount,
    left_only_keys: removed,
    right_only_keys: added,
    shared_keys: shared,
  };
}

function diffRecords(
  left: JsonValue,
  right: JsonValue,
  keyField: string | undefined,
  maxRecords: number,
): RecordDiffSummary {
  const leftMap = recordsMap(left);
  const rightMap = recordsMap(right);
  const key = keyField ?? detectKey(leftMap, rightMap) ?? "id";

  const records: RecordDiff[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;
  let shared = 0;
  const agreement = new Map<string, { agree: number; disagree: number; leftOnly: number; rightOnly: number }>();

  for (const k of rightMap.keys()) {
    if (!leftMap.has(k)) {
      added += 1;
      if (records.length < maxRecords) records.push({ key: k, status: "added", changes: [] });
    }
  }
  for (const k of leftMap.keys()) {
    if (!rightMap.has(k)) {
      removed += 1;
      if (records.length < maxRecords) records.push({ key: k, status: "removed", changes: [] });
    }
  }
  for (const k of leftMap.keys()) {
    if (!rightMap.has(k)) continue;
    shared += 1;
    accumulateAgreement(leftMap.get(k)!, rightMap.get(k)!, agreement);
    const changes = diffValue("", leftMap.get(k)!, rightMap.get(k)!);
    if (changes.length === 0) {
      unchanged += 1;
      if (records.length < maxRecords) records.push({ key: k, status: "unchanged", changes });
    } else {
      changed += 1;
      if (records.length < maxRecords) records.push({ key: k, status: "changed", changes });
    }
  }

  const fieldAgreement: FieldAgreement[] = [...agreement.entries()]
    .map(([path, acc]) => {
      const total = acc.agree + acc.disagree + acc.leftOnly + acc.rightOnly;
      return {
        path,
        agree: acc.agree,
        disagree: acc.disagree,
        left_only: acc.leftOnly,
        right_only: acc.rightOnly,
        total,
        agreement_rate: total === 0 ? 1 : acc.agree / total,
      };
    })
    .sort((a, b) => a.agreement_rate - b.agreement_rate);

  const agreeSum = fieldAgreement.reduce((sum, f) => sum + f.agree, 0);
  const totalSum = fieldAgreement.reduce((sum, f) => sum + f.total, 0);

  return {
    key_field: key,
    added,
    removed,
    changed,
    unchanged,
    shared,
    overall_agreement: totalSum === 0 ? 1 : agreeSum / totalSum,
    field_agreement: fieldAgreement,
    records,
    truncated: added + removed + changed + unchanged > maxRecords,
  };
}

function accumulateAgreement(
  left: JsonValue,
  right: JsonValue,
  out: Map<string, { agree: number; disagree: number; leftOnly: number; rightOnly: number }>,
) {
  const leftLeaves = new Map<string, JsonValue>();
  const rightLeaves = new Map<string, JsonValue>();
  flattenLeaves("", left, leftLeaves);
  flattenLeaves("", right, rightLeaves);
  const paths = new Set([...leftLeaves.keys(), ...rightLeaves.keys()]);
  for (const path of paths) {
    const entry = out.get(path) ?? { agree: 0, disagree: 0, leftOnly: 0, rightOnly: 0 };
    const hasLeft = leftLeaves.has(path);
    const hasRight = rightLeaves.has(path);
    if (hasLeft && hasRight) {
      if (JSON.stringify(leftLeaves.get(path)) === JSON.stringify(rightLeaves.get(path))) entry.agree += 1;
      else entry.disagree += 1;
    } else if (hasLeft) entry.leftOnly += 1;
    else entry.rightOnly += 1;
    out.set(path, entry);
  }
}

function flattenLeaves(path: string, value: JsonValue, out: Map<string, JsonValue>) {
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0) {
    for (const [key, child] of Object.entries(value)) {
      flattenLeaves(path ? `${path}.${key}` : key, child, out);
    }
  } else {
    out.set(path, value);
  }
}

function recordsMap(value: JsonValue): Map<string, JsonValue> {
  const map = new Map<string, JsonValue>();
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const key = extractKey(item) ?? String(index);
      map.set(key, item);
    });
    return map;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) map.set(key, child);
  }
  return map;
}

function extractKey(value: JsonValue): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const candidate of ["platform_job_id", "id", "uuid", "job_id", "_id", "key", "slug"]) {
    if (candidate in value) return String((value as Record<string, JsonValue>)[candidate]);
  }
  return null;
}

function detectKey(left: Map<string, JsonValue>, right: Map<string, JsonValue>): string | null {
  for (const candidate of ["platform_job_id", "id", "uuid", "job_id", "_id"]) {
    const hasLeft = [...left.values()].some((v) => v && typeof v === "object" && !Array.isArray(v) && candidate in v);
    const hasRight = [...right.values()].some((v) => v && typeof v === "object" && !Array.isArray(v) && candidate in v);
    if (hasLeft && hasRight) return candidate;
  }
  return null;
}

function diffValue(path: string, left: JsonValue, right: JsonValue): RecordDiff["changes"] {
  if (JSON.stringify(left) === JSON.stringify(right)) return [];
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) => {
      const childPath = path ? `${path}.${key}` : key;
      const l = (left as Record<string, JsonValue>)[key];
      const r = (right as Record<string, JsonValue>)[key];
      if (l === undefined) return [{ path: childPath, left: undefined, right: r }];
      if (r === undefined) return [{ path: childPath, left: l, right: undefined }];
      return diffValue(childPath, l, r);
    });
  }
  return [{ path: path || "value", left, right }];
}
