import { formatBytes, openExternal } from "../lib/api";
import { DONATE_URL } from "../lib/links";
import type { DocumentMeta } from "../types";
import { CloseIcon, CoffeeIcon, FileIcon, PlusIcon, ShieldIcon } from "./icons";

interface SidebarProps {
  documents: DocumentMeta[];
  activeId: string | null;
  loading: boolean;
  onOpenFiles: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function Sidebar({
  documents,
  activeId,
  loading,
  onOpenFiles,
  onSelect,
  onClose,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Datasets</span>
        <button className="icon-btn" onClick={onOpenFiles} disabled={loading} title="Add files">
          <PlusIcon />
        </button>
      </div>

      <div className="sidebar-list">
        {documents.length === 0 && (
          <div className="sidebar-empty">No files yet. Add JSON to begin.</div>
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
