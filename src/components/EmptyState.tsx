import { useCallback, useState } from "react";
import { openExternal } from "../lib/api";
import { DONATE_URL, LICENSE, REPO_URL } from "../lib/links";
import { BoltIcon, CoffeeIcon, CompareIcon, Logo, QueryIcon, ShieldIcon } from "./icons";

interface EmptyStateProps {
  onOpenFiles: () => void;
  onDropFiles: (files: File[]) => void;
}

const features = [
  { icon: BoltIcon, title: "Built for scale", body: "Rust core parses 10MB+ in milliseconds. Lazy graph expansion keeps deep structures fast." },
  { icon: CompareIcon, title: "LLM output diff", body: "Compare two model runs field-by-field. See exactly where outputs agree and diverge." },
  { icon: QueryIcon, title: "Query anything", body: "Extract and inspect fields with JSONPath — $[*].field, recursive descent, wildcards." },
  { icon: ShieldIcon, title: "Yours alone", body: "Everything runs on your machine. No uploads, no accounts, no limits, no cost." },
];

export function EmptyState({ onOpenFiles, onDropFiles }: EmptyStateProps) {
  const [dragging, setDragging] = useState(false);

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
    <div className="empty">
      <div className="empty-inner">
        <div className="empty-logo">
          <Logo width={44} height={44} />
        </div>
        <h1>Visualize and compare JSON, instantly.</h1>
        <p className="empty-sub">
          A free, open-source JSON workspace for large datasets and LLM output evaluation.
          Drop files below — they never leave your device.
        </p>

        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={onOpenFiles}
        >
          <div className="dropzone-icon">{"{ }"}</div>
          <div className="dropzone-text">
            <strong>Drop JSON, JSONL or NDJSON files</strong>
            <span>or click to browse — add two or more to compare</span>
          </div>
        </div>

        <div className="empty-features">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="feature">
              <Icon width={18} height={18} />
              <div>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="empty-footer">
          <button className="donate-btn" onClick={() => openExternal(DONATE_URL)}>
            <CoffeeIcon width={15} height={15} />
            <span>Buy me a coffee</span>
          </button>
          <span className="empty-footer-meta">
            Free & open source ·{" "}
            <a
              href={REPO_URL}
              onClick={(e) => {
                e.preventDefault();
                void openExternal(REPO_URL);
              }}
            >
              {LICENSE}
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
