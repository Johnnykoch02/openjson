import { useCallback, useEffect, useState } from "react";
import {
  closeDocument,
  compareRecords,
  compareSchemas,
  getSchema,
  keyFieldCandidates,
  listDocuments,
  loadJsonText,
  pickAndOpenFiles,
} from "./lib/api";
import { useWorkspace } from "./stores/workspace";
import { ComparePanel } from "./components/ComparePanel";
import { EmptyState } from "./components/EmptyState";
import { GraphView } from "./components/GraphView";
import { Inspector } from "./components/Inspector";
import { QueryPanel } from "./components/QueryPanel";
import { SchemaPanel } from "./components/SchemaPanel";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { TreeView } from "./components/TreeView";
import "./App.css";

function App() {
  const {
    documents,
    activeId,
    compareLeftId,
    compareRightId,
    viewMode,
    schema,
    schemaDiff,
    recordDiff,
    loading,
    error,
    setDocuments,
    setActiveId,
    setCompareIds,
    setViewMode,
    setSchema,
    setSchemaDiff,
    setRecordDiff,
    setLoading,
    setError,
  } = useWorkspace();

  const [keyField, setKeyField] = useState<string | undefined>(undefined);
  const [keyCandidates, setKeyCandidates] = useState<string[]>([]);

  const syncDocuments = useCallback(async (): Promise<typeof documents> => {
    const docs = await listDocuments();
    setDocuments(docs);
    return docs;
  }, [setDocuments]);

  useEffect(() => {
    syncDocuments().catch((err) => setError(String(err)));
  }, [syncDocuments, setError]);

  useEffect(() => {
    if (!activeId) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    getSchema(activeId)
      .then((next) => !cancelled && setSchema(next))
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [activeId, setSchema, setError]);

  const adoptOpened = useCallback(
    (docs: typeof documents, openedIds: string[]) => {
      if (openedIds.length > 0) {
        setActiveId(openedIds[openedIds.length - 1]);
      } else if (!activeId && docs.length > 0) {
        setActiveId(docs[0].id);
      }
      if (docs.length >= 2 && (!compareLeftId || !compareRightId)) {
        setCompareIds(docs[0].id, docs[1].id);
      }
    },
    [activeId, compareLeftId, compareRightId, setActiveId, setCompareIds],
  );

  async function handleOpenFiles() {
    setLoading(true);
    setError(null);
    try {
      const opened = await pickAndOpenFiles();
      const docs = await syncDocuments();
      adoptOpened(docs, opened.map((d) => d.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDropFiles(files: File[]) {
    setLoading(true);
    setError(null);
    try {
      const opened = [];
      for (const file of files) {
        const text = await file.text();
        opened.push(await loadJsonText(file.name, text));
      }
      const docs = await syncDocuments();
      adoptOpened(docs, opened.map((d) => d.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleClose(documentId: string) {
    await closeDocument(documentId);
    const docs = await syncDocuments();
    if (activeId === documentId) setActiveId(docs[0]?.id ?? null);
    if (compareLeftId === documentId || compareRightId === documentId) {
      setCompareIds(docs[0]?.id ?? null, docs[1]?.id ?? docs[0]?.id ?? null);
    }
  }

  const runCompare = useCallback(
    async (overrideKey?: string) => {
      if (!compareLeftId || !compareRightId) return;
      setLoading(true);
      setError(null);
      try {
        const [nextSchemaDiff, nextRecordDiff, candidates] = await Promise.all([
          compareSchemas(compareLeftId, compareRightId),
          compareRecords(compareLeftId, compareRightId, overrideKey),
          keyFieldCandidates(compareLeftId, compareRightId),
        ]);
        setSchemaDiff(nextSchemaDiff);
        setRecordDiff(nextRecordDiff);
        setKeyCandidates(candidates);
        setKeyField(nextRecordDiff.key_field);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [compareLeftId, compareRightId, setError, setLoading, setRecordDiff, setSchemaDiff],
  );

  async function handleChangeKeyField(field: string) {
    if (!compareLeftId || !compareRightId) return;
    setKeyField(field);
    setLoading(true);
    setError(null);
    try {
      const nextRecordDiff = await compareRecords(compareLeftId, compareRightId, field);
      setRecordDiff(nextRecordDiff);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const leftName = documents.find((d) => d.id === compareLeftId)?.name ?? "A";
  const rightName = documents.find((d) => d.id === compareRightId)?.name ?? "B";
  const hasDocuments = documents.length > 0;

  return (
    <div className="app">
      <TopBar
        documents={documents}
        viewMode={viewMode}
        compareLeftId={compareLeftId}
        compareRightId={compareRightId}
        loading={loading}
        onViewModeChange={setViewMode}
        onCompareLeftChange={(id) => setCompareIds(id, compareRightId)}
        onCompareRightChange={(id) => setCompareIds(compareLeftId, id)}
        onSwap={() => setCompareIds(compareRightId, compareLeftId)}
        onRunCompare={() => runCompare(keyField)}
      />

      {loading && <div className="progress" />}
      {error && <div className="error-bar">{error}</div>}

      <div className="body">
        <Sidebar
          documents={documents}
          activeId={activeId}
          loading={loading}
          onOpenFiles={handleOpenFiles}
          onSelect={setActiveId}
          onClose={handleClose}
        />

        <main className="canvas">
          {!hasDocuments ? (
            <EmptyState onOpenFiles={handleOpenFiles} onDropFiles={handleDropFiles} />
          ) : (
            <>
              {viewMode === "tree" && <TreeView documentId={activeId} />}
              {viewMode === "graph" && <GraphView documentId={activeId} />}
              {viewMode === "schema" && <SchemaPanel schema={schema} />}
              {viewMode === "query" && <QueryPanel documentId={activeId} />}
              {viewMode === "compare" && (
                <ComparePanel
                  schemaDiff={schemaDiff}
                  recordDiff={recordDiff}
                  leftId={compareLeftId}
                  rightId={compareRightId}
                  leftName={leftName}
                  rightName={rightName}
                  hasPair={Boolean(compareLeftId && compareRightId && documents.length >= 2)}
                  keyField={keyField ?? recordDiff?.key_field ?? ""}
                  keyCandidates={keyCandidates}
                  onChangeKeyField={handleChangeKeyField}
                />
              )}
            </>
          )}
        </main>
      </div>

      <Inspector />
    </div>
  );
}

export default App;
