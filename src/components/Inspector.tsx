import { useWorkspace } from "../stores/workspace";
import { CloseIcon, CopyIcon } from "./icons";
import { ValueRenderer } from "./ValueRenderer";

export function Inspector() {
  const inspector = useWorkspace((s) => s.inspector);
  const closeInspector = useWorkspace((s) => s.closeInspector);

  if (!inspector) return null;

  const raw =
    typeof inspector.value === "string"
      ? inspector.value
      : JSON.stringify(inspector.value, null, 2);

  return (
    <>
      <div className="inspector-scrim" onClick={closeInspector} />
      <aside className="inspector">
        <header className="inspector-head">
          <div className="inspector-title">
            <code title={inspector.title}>{inspector.title}</code>
            {inspector.subtitle && <span>{inspector.subtitle}</span>}
          </div>
          <div className="inspector-actions">
            <button
              className="icon-btn"
              title="Copy raw value"
              onClick={() => navigator.clipboard?.writeText(raw)}
            >
              <CopyIcon />
            </button>
            <button className="icon-btn" title="Close" onClick={closeInspector}>
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="inspector-body">
          <ValueRenderer value={inspector.value} />
        </div>
      </aside>
    </>
  );
}
