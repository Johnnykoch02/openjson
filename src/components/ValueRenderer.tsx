import { useState } from "react";
import { openExternal } from "../lib/api";
import { classifyString, isDomainish, toSafeHtml } from "../lib/render";

interface ValueRendererProps {
  value: unknown;
  depth?: number;
  fieldName?: string;
}

export function ValueRenderer({ value, depth = 0, fieldName }: ValueRendererProps) {
  if (value === null) return <span className="scalar scalar-null">null</span>;
  if (value === undefined) return <span className="scalar scalar-null">∅ missing</span>;

  if (typeof value === "boolean") {
    return <span className="scalar scalar-boolean">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="scalar scalar-number">{value}</span>;
  }
  if (typeof value === "string") {
    return <StringValue value={value} fieldName={fieldName} />;
  }
  if (Array.isArray(value)) {
    return <ArrayValue value={value} depth={depth} />;
  }
  if (typeof value === "object") {
    return <ObjectValue value={value as Record<string, unknown>} depth={depth} />;
  }
  return <span className="scalar">{String(value)}</span>;
}

function StringValue({ value, fieldName }: { value: string; fieldName?: string }) {
  const kind = classifyString(value);
  const looksLink = kind === "url" || (isDomainish(value) && hintsLink(fieldName));

  if (looksLink) {
    return (
      <a
        className="value-link"
        href={value}
        onClick={(e) => {
          e.preventDefault();
          void openExternal(value);
        }}
      >
        {value}
      </a>
    );
  }

  if (kind === "html" || kind === "markdown") {
    return (
      <div
        className="prose"
        onClick={interceptAnchors}
        dangerouslySetInnerHTML={{ __html: toSafeHtml(value, kind === "html" ? "html" : "markdown") }}
      />
    );
  }

  if (kind === "multiline") {
    return <pre className="value-text">{value}</pre>;
  }

  return <span className="scalar scalar-string">{value}</span>;
}

function ArrayValue({ value, depth }: { value: unknown[]; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  if (value.length === 0) return <span className="scalar-empty">[ ] empty array</span>;

  return (
    <div className="nested">
      <button className={`nested-toggle ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span className="nested-caret">{open ? "▾" : "▸"}</span>
        <span className="nested-summary">{value.length} items</span>
      </button>
      {open && (
        <div className="nested-body">
          {value.map((item, index) => (
            <div className="nested-row" key={index}>
              <span className="nested-key">{index}</span>
              <div className="nested-val">
                <ValueRenderer value={item} depth={depth + 1} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectValue({ value, depth }: { value: Record<string, unknown>; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="scalar-empty">{"{ }"} empty object</span>;

  return (
    <div className="nested">
      <button className={`nested-toggle ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span className="nested-caret">{open ? "▾" : "▸"}</span>
        <span className="nested-summary">{entries.length} keys</span>
      </button>
      {open && (
        <div className="nested-body">
          {entries.map(([key, item]) => (
            <div className="nested-row" key={key}>
              <span className="nested-key">{key}</span>
              <div className="nested-val">
                <ValueRenderer value={item} depth={depth + 1} fieldName={key} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function hintsLink(fieldName?: string): boolean {
  if (!fieldName) return false;
  return /link|url|website|site|href/i.test(fieldName);
}

function interceptAnchors(event: React.MouseEvent<HTMLDivElement>) {
  const target = (event.target as HTMLElement).closest("a");
  if (target && target.getAttribute("href")) {
    event.preventDefault();
    void openExternal(target.getAttribute("href")!);
  }
}
