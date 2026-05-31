import { useEffect, useMemo, useState } from "react";
import { getRecord } from "../lib/api";
import { useWorkspace } from "../stores/workspace";
import type {
  FieldAgreement,
  RecordDiff,
  RecordDiffStatus,
  RecordDiffSummary,
  SchemaDiff,
} from "../types";
import { ValueRenderer } from "./ValueRenderer";

interface ComparePanelProps {
  schemaDiff: SchemaDiff | null;
  recordDiff: RecordDiffSummary | null;
  leftId: string | null;
  rightId: string | null;
  leftName: string;
  rightName: string;
  hasPair: boolean;
  keyField: string;
  keyCandidates: string[];
  onChangeKeyField: (field: string) => void;
}

type RecordFilter = "all" | RecordDiffStatus;

export function ComparePanel({
  schemaDiff,
  recordDiff,
  leftId,
  rightId,
  leftName,
  rightName,
  hasPair,
  keyField,
  keyCandidates,
  onChangeKeyField,
}: ComparePanelProps) {
  const [filter, setFilter] = useState<RecordFilter>("changed");
  const [search, setSearch] = useState("");

  const filteredRecords = useMemo(() => {
    if (!recordDiff) return [];
    return recordDiff.records.filter((record) => {
      if (filter !== "all" && record.status !== filter) return false;
      if (search && !record.key.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [recordDiff, filter, search]);

  if (!hasPair) {
    return (
      <div className="panel-empty">
        Open at least two datasets, then pick model A and model B above to compare.
      </div>
    );
  }

  if (!schemaDiff && !recordDiff) {
    return (
      <div className="panel-empty">
        Hit <strong>Compare</strong> to diff <code>{leftName}</code> against{" "}
        <code>{rightName}</code>.
      </div>
    );
  }

  return (
    <div className="scroll-panel">
      <div className="compare-models">
        <span className="model-tag model-a">A · {leftName}</span>
        <span className="model-vs">vs</span>
        <span className="model-tag model-b">B · {rightName}</span>
      </div>

      {recordDiff && (
        <section>
          <div className="agreement-hero">
            <Gauge value={recordDiff.overall_agreement} />
            <div className="agreement-hero-text">
              <span className="hero-label">Overall value agreement</span>
              <span className="hero-sub">
                across {recordDiff.shared.toLocaleString()} shared records
              </span>
              <label className="key-picker">
                Keyed on
                <select value={keyField} onChange={(e) => onChangeKeyField(e.target.value)}>
                  {keyCandidates.length === 0 && <option value={keyField}>{keyField}</option>}
                  {keyCandidates.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="agreement-counts">
              <CountChip label="Identical" value={recordDiff.unchanged} tone="match" />
              <CountChip label="Differing" value={recordDiff.changed} tone="changed" />
              <CountChip label="Only in A" value={recordDiff.removed} tone="removed" />
              <CountChip label="Only in B" value={recordDiff.added} tone="added" />
            </div>
          </div>

          {recordDiff.field_agreement.length > 0 && (
            <div className="scorecard">
              <h3>Field agreement — most divergent first</h3>
              <div className="scorecard-list">
                {recordDiff.field_agreement.map((field) => (
                  <FieldAgreementRow key={field.path} field={field} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {schemaDiff && (
        <section className="compare-block">
          <h3>Schema differences</h3>
          <div className="schema-diff-grid">
            <SchemaDiffColumn
              title={`Only in A (${schemaDiff.removed_fields.length})`}
              tone="removed"
              items={schemaDiff.removed_fields.map((f) => `${f.path} · ${f.types.join("|")}`)}
            />
            <SchemaDiffColumn
              title={`Only in B (${schemaDiff.added_fields.length})`}
              tone="added"
              items={schemaDiff.added_fields.map((f) => `${f.path} · ${f.types.join("|")}`)}
            />
            <SchemaDiffColumn
              title={`Type / coverage shifts (${schemaDiff.changed_fields.length})`}
              tone="changed"
              items={schemaDiff.changed_fields.map(
                (c) =>
                  `${c.path}: ${c.left_types.join("|")} (${Math.round(
                    c.left_occurrence_rate * 100,
                  )}%) → ${c.right_types.join("|")} (${Math.round(
                    c.right_occurrence_rate * 100,
                  )}%)`,
              )}
            />
          </div>
        </section>
      )}

      {recordDiff && (
        <section className="compare-block">
          <div className="records-head">
            <h3>Record explorer</h3>
            <div className="records-controls">
              <input
                className="search-input"
                placeholder="Filter by key…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="seg-control">
                {(["all", "changed", "added", "removed", "unchanged"] as RecordFilter[]).map(
                  (option) => (
                    <button
                      key={option}
                      className={filter === option ? "active" : ""}
                      onClick={() => setFilter(option)}
                    >
                      {option}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          {recordDiff.truncated && (
            <div className="inline-note">
              Showing first {recordDiff.records.length} records — refine with the filter.
            </div>
          )}

          <div className="record-list">
            {filteredRecords.length === 0 && (
              <div className="panel-empty small">No records match this filter.</div>
            )}
            {filteredRecords.map((record) => (
              <RecordRow
                key={`${record.status}-${record.key}`}
                record={record}
                leftId={leftId}
                rightId={rightId}
                leftName={leftName}
                rightName={rightName}
                keyField={keyField}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RecordRow({
  record,
  leftId,
  rightId,
  leftName,
  rightName,
  keyField,
}: {
  record: RecordDiff;
  leftId: string | null;
  rightId: string | null;
  leftName: string;
  rightName: string;
  keyField: string;
}) {
  const [open, setOpen] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [left, setLeft] = useState<unknown>(undefined);
  const [right, setRight] = useState<unknown>(undefined);
  const [loaded, setLoaded] = useState(false);
  const openInspector = useWorkspace((s) => s.openInspector);

  useEffect(() => {
    if (!open || loaded || !leftId || !rightId) return;
    let cancelled = false;
    Promise.all([
      getRecord(leftId, record.key, keyField),
      getRecord(rightId, record.key, keyField),
    ]).then(([a, b]) => {
      if (cancelled) return;
      setLeft(a);
      setRight(b);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, leftId, rightId, record.key, keyField]);

  return (
    <div className={`record record-${record.status}`}>
      <button className="record-summary" onClick={() => setOpen((v) => !v)}>
        <span className={`status-dot status-${record.status}`} />
        <code className="record-key">{record.key}</code>
        <span className="record-status-label">{record.status}</span>
        {record.changes.length > 0 && (
          <span className="record-change-count">{record.changes.length} fields differ</span>
        )}
        <span className={`record-chevron ${open ? "open" : ""}`}>›</span>
      </button>

      {open && (
        <div className="record-detail">
          {!loaded ? (
            <div className="record-loading">loading items…</div>
          ) : (
            <>
              <div className="record-side-by-side">
                <RecordItem
                  label={`A · ${leftName}`}
                  tone="a"
                  value={left}
                  onInspect={(title, value) => openInspector({ title, value })}
                />
                <RecordItem
                  label={`B · ${rightName}`}
                  tone="b"
                  value={right}
                  onInspect={(title, value) => openInspector({ title, value })}
                />
              </div>

              {record.changes.length > 0 && (
                <div className="field-changes-block">
                  <button className="ghost-btn" onClick={() => setShowChanges((v) => !v)}>
                    {showChanges ? "Hide" : "Show"} {record.changes.length} field-level diffs
                  </button>
                  {showChanges && (
                    <div className="record-changes">
                      {record.changes.map((change) => (
                        <div className="change" key={change.path}>
                          <code className="change-path">{change.path}</code>
                          <div className="change-side change-a">{formatValue(change.left)}</div>
                          <div className="change-side change-b">{formatValue(change.right)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RecordItem({
  label,
  tone,
  value,
  onInspect,
}: {
  label: string;
  tone: "a" | "b";
  value: unknown;
  onInspect: (title: string, value: unknown) => void;
}) {
  if (value === null || value === undefined) {
    return (
      <div className={`record-item record-item-${tone}`}>
        <header>{label}</header>
        <div className="record-item-missing">not present in this dataset</div>
      </div>
    );
  }

  const entries =
    typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>)
      : null;

  return (
    <div className={`record-item record-item-${tone}`}>
      <header>{label}</header>
      <div className="record-item-body">
        {entries ? (
          entries.map(([key, val]) => (
            <div className="item-field" key={key}>
              <button className="item-key" onClick={() => onInspect(key, val)} title="Inspect">
                {key}
              </button>
              <div className="item-val">
                <ValueRenderer value={val} depth={1} fieldName={key} />
              </div>
            </div>
          ))
        ) : (
          <ValueRenderer value={value} />
        )}
      </div>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const angle = value * 360;
  const color = pct >= 90 ? "var(--green)" : pct >= 70 ? "var(--amber)" : "var(--red)";
  return (
    <div
      className="gauge"
      style={{ background: `conic-gradient(${color} ${angle}deg, var(--surface-2) 0deg)` }}
    >
      <div className="gauge-inner">
        <span className="gauge-value">{pct}%</span>
      </div>
    </div>
  );
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "match" | "changed" | "added" | "removed";
}) {
  return (
    <div className={`count-chip count-${tone}`}>
      <span className="count-value">{value.toLocaleString()}</span>
      <span className="count-label">{label}</span>
    </div>
  );
}

function FieldAgreementRow({ field }: { field: FieldAgreement }) {
  const pct = Math.round(field.agreement_rate * 100);
  const color = pct >= 90 ? "var(--green)" : pct >= 70 ? "var(--amber)" : "var(--red)";
  return (
    <div className="score-row">
      <code className="score-path" title={field.path}>
        {field.path}
      </code>
      <div className="score-bar">
        <span className="score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-pct" style={{ color }}>
        {pct}%
      </span>
      <span className="score-detail">
        {field.disagree > 0 && <span className="d-changed">{field.disagree} differ</span>}
        {field.left_only > 0 && <span className="d-removed">{field.left_only} A-only</span>}
        {field.right_only > 0 && <span className="d-added">{field.right_only} B-only</span>}
      </span>
    </div>
  );
}

function SchemaDiffColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "added" | "removed" | "changed";
  items: string[];
}) {
  return (
    <div className={`schema-col schema-${tone}`}>
      <h4>{title}</h4>
      {items.length === 0 ? (
        <span className="schema-col-empty">none</span>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item}>
              <code>{item}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined) return "∅";
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 157)}…` : value;
  return JSON.stringify(value);
}
