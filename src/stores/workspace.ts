import { create } from "zustand";
import type {
  DocumentMeta,
  InferredSchema,
  QueryResult,
  RecordDiffSummary,
  SchemaDiff,
  ViewMode,
} from "../types";

export interface InspectorTarget {
  title: string;
  subtitle?: string;
  value: unknown;
}

interface WorkspaceState {
  documents: DocumentMeta[];
  activeId: string | null;
  compareLeftId: string | null;
  compareRightId: string | null;
  viewMode: ViewMode;
  schema: InferredSchema | null;
  schemaDiff: SchemaDiff | null;
  recordDiff: RecordDiffSummary | null;
  queryResult: QueryResult | null;
  inspector: InspectorTarget | null;
  loading: boolean;
  error: string | null;
  setDocuments: (documents: DocumentMeta[]) => void;
  setActiveId: (id: string | null) => void;
  setCompareIds: (leftId: string | null, rightId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSchema: (schema: InferredSchema | null) => void;
  setSchemaDiff: (diff: SchemaDiff | null) => void;
  setRecordDiff: (diff: RecordDiffSummary | null) => void;
  setQueryResult: (result: QueryResult | null) => void;
  openInspector: (target: InspectorTarget) => void;
  closeInspector: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  documents: [],
  activeId: null,
  compareLeftId: null,
  compareRightId: null,
  viewMode: "tree",
  schema: null,
  schemaDiff: null,
  recordDiff: null,
  queryResult: null,
  inspector: null,
  loading: false,
  error: null,
  setDocuments: (documents) => set({ documents }),
  setActiveId: (activeId) => set({ activeId }),
  setCompareIds: (compareLeftId, compareRightId) => set({ compareLeftId, compareRightId }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSchema: (schema) => set({ schema }),
  setSchemaDiff: (schemaDiff) => set({ schemaDiff }),
  setRecordDiff: (recordDiff) => set({ recordDiff }),
  setQueryResult: (queryResult) => set({ queryResult }),
  openInspector: (inspector) => set({ inspector }),
  closeInspector: () => set({ inspector: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
