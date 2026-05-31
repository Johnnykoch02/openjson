import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode, NodeKind } from "../types";

export interface JsonNodeData {
  node: GraphNode;
  expanded: boolean;
  onToggle: (node: GraphNode) => void;
  [key: string]: unknown;
}

const kindAccent: Record<NodeKind, string> = {
  root: "var(--accent)",
  object: "var(--accent)",
  array: "var(--cyan)",
  property: "var(--border-strong)",
  item: "var(--cyan)",
  string: "var(--green)",
  number: "var(--amber)",
  boolean: "var(--violet)",
  null: "var(--muted)",
};

export function JsonFlowNode({ data }: NodeProps) {
  const { node, expanded, onToggle } = data as JsonNodeData;
  const hasChildren = node.expandable && node.child_count > 0;

  return (
    <div className="flow-node" style={{ ["--node-accent" as string]: kindAccent[node.kind] }}>
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <span className="flow-node-stripe" />
      <div className="flow-node-body">
        <div className="flow-node-label">{node.label}</div>
        {node.value_preview && !node.expandable && (
          <div className="flow-node-value">{node.value_preview}</div>
        )}
        {node.expandable && (
          <div className="flow-node-meta">
            {node.kind === "array" || node.label.startsWith("[")
              ? `${node.child_count} items`
              : `${node.child_count} keys`}
          </div>
        )}
      </div>
      {hasChildren && (
        <button
          type="button"
          className={`flow-node-toggle ${expanded ? "open" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node);
          }}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "−" : "+"}
        </button>
      )}
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}
