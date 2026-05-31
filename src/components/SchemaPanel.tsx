import { useState } from "react";
import { formatBytes } from "../lib/api";
import type { InferredField, InferredSchema } from "../types";
import { ChevronRight } from "./icons";

interface SchemaPanelProps {
  schema: InferredSchema | null;
}

export function SchemaPanel({ schema }: SchemaPanelProps) {
  if (!schema) {
    return <div className="panel-empty">Select a dataset to inspect its inferred schema.</div>;
  }

  return (
    <div className="scroll-panel">
      <div className="panel-head">
        <h2>Inferred schema</h2>
        <p>Implicit structure detected across {schema.record_count.toLocaleString()} records.</p>
      </div>

      <div className="metric-row">
        <Metric label="Root type" value={schema.root_type} />
        <Metric label="Records" value={schema.record_count.toLocaleString()} />
        <Metric label="Size" value={formatBytes(schema.byte_size)} />
        <Metric label="Top-level fields" value={String(schema.top_level_keys.length)} />
      </div>

      <div className="field-list">
        {schema.fields.map((field) => (
          <FieldRow key={field.path} field={field} depth={0} />
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

function FieldRow({ field, depth }: { field: InferredField; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const coverage =
    field.total_samples > 0
      ? Math.round((field.occurrence_count / field.total_samples) * 100)
      : 0;
  const hasChildren = field.nested_fields.length > 0;

  return (
    <div className="field-block">
      <div className="field-row" style={{ paddingLeft: 12 + depth * 18 }}>
        <button
          className={`field-caret ${hasChildren ? "" : "hidden"} ${open ? "open" : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight width={13} height={13} />
        </button>
        <span className="field-name">{field.name}</span>
        <span className="field-types">
          {field.types.map((t) => (
            <span key={t} className={`type-chip type-${t}`}>
              {t}
            </span>
          ))}
        </span>
        {field.nullable && <span className="field-flag">nullable</span>}
        <span className="field-spacer" />
        {field.sample_values.length > 0 && (
          <code className="field-sample" title={field.sample_values.join(" · ")}>
            {field.sample_values[0]}
          </code>
        )}
        <span className="coverage" title={`Present in ${coverage}% of records`}>
          <span className="coverage-bar">
            <span
              className="coverage-fill"
              style={{ width: `${coverage}%`, background: coverageColor(coverage) }}
            />
          </span>
          <span className="coverage-pct">{coverage}%</span>
        </span>
      </div>
      {open && hasChildren && (
        <div className="field-children">
          {field.nested_fields.map((nested) => (
            <FieldRow key={nested.path} field={nested} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function coverageColor(pct: number): string {
  if (pct >= 95) return "var(--green)";
  if (pct >= 60) return "var(--amber)";
  return "var(--red)";
}
