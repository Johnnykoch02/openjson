import { useCallback, useState } from "react";
import { formatBytes, openExternal } from "../lib/api";
import { DONATE_URL } from "../lib/links";
import type { DocumentMeta } from "../types";
import { CloseIcon, CoffeeIcon, FileIcon, PlusIcon, ShieldIcon } from "./icons";

interface SidebarProps {
  documents: DocumentMeta[];
  activeId: string | null;
  loading: boolean;
  onOpenFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function Sidebar({
  documents,
  activeId,
  loading,
  onOpenFiles,
  onDropFiles,
  onSelect,
  onClose,
}: SidebarProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) onDropFiles(files);
    },
    [onDropFiles],
  );

  return (
    <aside
      className={`sidebar ${dragging ? "sidebar-dragging" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="sidebar-header">
        <span className="sidebar-title">Datasets</span>
        <button className="icon-btn" onClick={onOpenFiles} disabled={loading} title="Add files">
          <PlusIcon />
        </button>
      </div>

      <div className="sidebar-list">
        {dragging && (
          <div className="sidebar-drop-hint">
            <strong>Drop JSON files here</strong>
            <span>Add any number of .json, .jsonl, or .ndjson files</span>
          </div>
        )}
        {documents.length === 0 && !dragging && (
          <div className="sidebar-empty">
            No files yet. Drop JSON here or click + to browse.
          </div>
        )}
        {documents.map((doc) => (
          <button
            key={doc.id}
            className={`dataset ${doc.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(doc.id)}
          >
            <FileIcon className="dataset-icon" />
            <span className="dataset-info">
              <span className="dataset-name" title={doc.name}>
                {doc.name}
              </span>
              <span className="dataset-meta">
                {formatBytes(doc.byte_size)} · {doc.record_count.toLocaleString()}{" "}
                {doc.root_type === "array" ? "records" : doc.root_type}
              </span>
            </span>
            <span
              className="dataset-close"
              onClick={(event) => {
                event.stopPropagation();
                onClose(doc.id);
              }}
            >
              <CloseIcon width={14} height={14} />
            </span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-line">
          <ShieldIcon width={14} height={14} />
          <span>100% local · no upload · no account</span>
        </div>
        <button className="donate-btn" onClick={() => openExternal(DONATE_URL)}>
          <CoffeeIcon width={15} height={15} />
          <span>Buy me a coffee</span>
        </button>
      </div>
    </aside>
  );
}
