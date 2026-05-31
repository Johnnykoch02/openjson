import type { DocumentMeta, ViewMode } from "../types";
import {
  CompareIcon,
  GraphIcon,
  Logo,
  QueryIcon,
  SchemaIcon,
  SwapIcon,
  TreeIcon,
} from "./icons";

interface TopBarProps {
  documents: DocumentMeta[];
  viewMode: ViewMode;
  compareLeftId: string | null;
  compareRightId: string | null;
  loading: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onCompareLeftChange: (id: string) => void;
  onCompareRightChange: (id: string) => void;
  onSwap: () => void;
  onRunCompare: () => void;
}

const views: { id: ViewMode; label: string; icon: typeof GraphIcon }[] = [
  { id: "tree", label: "Data", icon: TreeIcon },
  { id: "graph", label: "Graph", icon: GraphIcon },
  { id: "schema", label: "Schema", icon: SchemaIcon },
  { id: "query", label: "Query", icon: QueryIcon },
  { id: "compare", label: "Compare", icon: CompareIcon },
];

export function TopBar({
  documents,
  viewMode,
  compareLeftId,
  compareRightId,
  loading,
  onViewModeChange,
  onCompareLeftChange,
  onCompareRightChange,
  onSwap,
  onRunCompare,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Logo />
        <div className="topbar-brand-text">
          <strong>OpenJSON</strong>
          <span>JSON visualizer & LLM output diff</span>
        </div>
      </div>

      <nav className="view-switch">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`view-tab ${viewMode === id ? "active" : ""}`}
            onClick={() => onViewModeChange(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        {viewMode === "compare" && documents.length >= 2 ? (
          <div className="compare-bar">
            <select
              className="model-select"
              value={compareLeftId ?? ""}
              onChange={(e) => onCompareLeftChange(e.target.value)}
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.name}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={onSwap} title="Swap A/B">
              <SwapIcon />
            </button>
            <select
              className="model-select"
              value={compareRightId ?? ""}
              onChange={(e) => onCompareRightChange(e.target.value)}
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={onRunCompare} disabled={loading}>
              Compare
            </button>
          </div>
        ) : (
          <span className="env-badge">{isDesktop() ? "Desktop" : "Web"}</span>
        )}
      </div>
    </header>
  );
}

function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
