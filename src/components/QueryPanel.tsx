import { useState } from "react";
import { queryDocument } from "../lib/api";
import type { QueryResult } from "../types";

interface QueryPanelProps {
  documentId: string | null;
}

const EXAMPLES = [
  { label: "All records", q: "$[*]" },
  { label: "One field", q: "$[*].job_title" },
  { label: "Recursive", q: "$..salary" },
  { label: "First item", q: "$[0]" },
];

export function QueryPanel({ documentId }: QueryPanelProps) {
  const [query, setQuery] = useState("$[*]");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run(q = query) {
    if (!documentId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await queryDocument(documentId, q, 500);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  if (!documentId) {
    return <div className="panel-empty">Select a dataset to run queries.</div>;
  }

  return (
    <div className="query-panel">
      <div className="query-bar">
        <span className="query-prompt">JSONPath</span>
        <input
          className="query-input"
          value={query}
          spellCheck={false}
          placeholder="$[*].field"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <button className="btn btn-primary" onClick={() => run()} disabled={running}>
          {running ? "Running…" : "Run"}
        </button>
      </div>

      <div className="query-examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.q}
            className="example-chip"
            onClick={() => {
              setQuery(ex.q);
              void run(ex.q);
            }}
          >
            <code>{ex.q}</code>
            <span>{ex.label}</span>
          </button>
        ))}
      </div>

      {error && <div className="inline-error">{error}</div>}

      {result && (
        <>
          <div className="query-summary">
            <span>
              <strong>{result.total.toLocaleString()}</strong> matches
              {result.truncated && ` (showing first ${result.matches.length})`}
            </span>
            <span className="query-types">
              {result.type_breakdown.map(([type, count]) => (
                <span key={type} className={`type-chip type-${type}`}>
                  {type} · {count}
                </span>
              ))}
            </span>
          </div>

          <div className="query-results">
            {result.matches.map((match, index) => (
              <div className="query-match" key={`${match.path}-${index}`}>
                <code className="match-path">{match.path}</code>
                <pre className="match-value">{formatValue(match.value)}</pre>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
