export type JsonType =
  | "null"
  | "boolean"
  | "integer"
  | "number"
  | "string"
  | "array"
  | "object";

export interface DocumentMeta {
  id: string;
  name: string;
  byte_size: number;
  root_type: string;
  record_count: number;
  top_level_keys: string[];
}

export interface FileLoadError {
  name: string;
  message: string;
}

export interface OpenFilesResult {
  opened: DocumentMeta[];
  errors: FileLoadError[];
}

export interface InferredField {
  path: string;
  name: string;
  types: JsonType[];
  nullable: boolean;
  occurrence_count: number;
  total_samples: number;
  array_length_min?: number | null;
  array_length_max?: number | null;
  sample_values: string[];
  nested_fields: InferredField[];
}

export interface InferredSchema {
  root_type: JsonType;
  record_count: number;
  byte_size: number;
  fields: InferredField[];
  top_level_keys: string[];
}

export type NodeKind =
  | "root"
  | "object"
  | "array"
  | "property"
  | "item"
  | "string"
  | "number"
  | "boolean"
  | "null";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  path: string;
  value_preview?: string | null;
  child_count: number;
  expandable: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
}

export interface ChildrenSlice {
  parent_path: string;
  parent_id: string;
  total_children: number;
  offset: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  has_more: boolean;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  total_nodes: number;
}

export interface SchemaFieldChange {
  path: string;
  left_types: JsonType[];
  right_types: JsonType[];
  left_nullable: boolean;
  right_nullable: boolean;
  left_occurrence_rate: number;
  right_occurrence_rate: number;
}

export interface SchemaDiff {
  added_fields: InferredField[];
  removed_fields: InferredField[];
  changed_fields: SchemaFieldChange[];
  left_record_count: number;
  right_record_count: number;
  left_only_keys: string[];
  right_only_keys: string[];
  shared_keys: string[];
}

export type RecordDiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface RecordFieldChange {
  path: string;
  left?: unknown;
  right?: unknown;
}

export interface RecordDiff {
  key: string;
  status: RecordDiffStatus;
  changes: RecordFieldChange[];
}

export interface FieldAgreement {
  path: string;
  agree: number;
  disagree: number;
  left_only: number;
  right_only: number;
  total: number;
  agreement_rate: number;
}

export interface RecordDiffSummary {
  key_field: string;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  shared: number;
  overall_agreement: number;
  field_agreement: FieldAgreement[];
  records: RecordDiff[];
  truncated: boolean;
}

export interface QueryMatch {
  path: string;
  value: unknown;
  type_name: string;
}

export interface QueryResult {
  matches: QueryMatch[];
  total: number;
  truncated: boolean;
  type_breakdown: [string, number][];
}

export type ViewMode = "tree" | "graph" | "schema" | "query" | "compare";
