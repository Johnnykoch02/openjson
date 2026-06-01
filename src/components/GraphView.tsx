import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGraph, listChildren } from "../lib/api";
import { DEFAULT_EXPAND_DEPTH, MAX_SLICE_NODES } from "../lib/limits";
import { layoutGraph } from "../lib/layout";
import type { GraphEdge, GraphNode, NodeKind } from "../types";
import { JsonFlowNode, type JsonNodeData } from "./JsonFlowNode";

const nodeTypes = { json: JsonFlowNode };

const minimapColor: Record<NodeKind, string> = {
  root: "#6e7bff",
  object: "#6e7bff",
  array: "#3bc9db",
  property: "#3a3a44",
  item: "#3bc9db",
  string: "#51cf66",
  number: "#ffd43b",
  boolean: "#9d6bff",
  null: "#6b6b76",
};

interface GraphViewProps {
  documentId: string | null;
}

export function GraphView({ documentId }: GraphViewProps) {
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<GraphEdge[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const childrenIndex = useRef(new Map<string, string[]>());

  const rebuildChildIndex = useCallback((edges: GraphEdge[]) => {
    const index = new Map<string, string[]>();
    for (const edge of edges) {
      const list = index.get(edge.source) ?? [];
      list.push(edge.target);
      index.set(edge.source, list);
    }
    childrenIndex.current = index;
  }, []);

  useEffect(() => {
    if (!documentId) {
      setRawNodes([]);
      setRawEdges([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getGraph(documentId, MAX_SLICE_NODES, DEFAULT_EXPAND_DEPTH)
      .then((snapshot) => {
        if (cancelled) return;
        setRawNodes(snapshot.nodes);
        setRawEdges(snapshot.edges);
        setTruncated(snapshot.truncated);
        rebuildChildIndex(snapshot.edges);
        setExpanded(new Set(["root"]));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [documentId, rebuildChildIndex]);

  const collapse = useCallback((nodeId: string) => {
    const toRemove = new Set<string>();
    const queue = [...(childrenIndex.current.get(nodeId) ?? [])];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (toRemove.has(current)) continue;
      toRemove.add(current);
      queue.push(...(childrenIndex.current.get(current) ?? []));
    }
    setRawNodes((nodes) => nodes.filter((n) => !toRemove.has(n.id)));
    setRawEdges((edges) => {
      const next = edges.filter((e) => !toRemove.has(e.target));
      rebuildChildIndex(next);
      return next;
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      toRemove.forEach((id) => next.delete(id));
      return next;
    });
  }, [rebuildChildIndex]);

  const expand = useCallback(
    async (node: GraphNode) => {
      if (!documentId) return;
      const slice = await listChildren(documentId, node.path, 0, MAX_SLICE_NODES);
      setRawNodes((nodes) => {
        const seen = new Set(nodes.map((n) => n.id));
        const additions = slice.nodes.filter((n) => !seen.has(n.id));
        return [...nodes, ...additions];
      });
      setRawEdges((edges) => {
        const seen = new Set(edges.map((e) => e.id));
        const additions = slice.edges.filter((e) => !seen.has(e.id));
        const next = [...edges, ...additions];
        rebuildChildIndex(next);
        return next;
      });
      if (slice.has_more) setTruncated(true);
      setExpanded((prev) => new Set(prev).add(node.id));
    },
    [documentId, rebuildChildIndex],
  );

  const onToggle = useCallback(
    (node: GraphNode) => {
      if (expanded.has(node.id)) collapse(node.id);
      else void expand(node);
    },
    [expanded, collapse, expand],
  );

  const { nodes, edges } = useMemo(() => {
    const flowNodes: Node[] = rawNodes.map((node) => ({
      id: node.id,
      type: "json",
      position: { x: 0, y: 0 },
      data: { node, expanded: expanded.has(node.id), onToggle } satisfies JsonNodeData,
    }));

    const flowEdges: Edge[] = rawEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      style: { stroke: "var(--edge)", strokeWidth: 1.5 },
    }));

    return { nodes: layoutGraph(flowNodes, flowEdges, "LR"), edges: flowEdges };
  }, [rawNodes, rawEdges, expanded, onToggle]);

  if (!documentId) {
    return null;
  }

  return (
    <div className="graph-panel">
      <div className="graph-status">
        <span>
          {rawNodes.length} nodes · click <strong>+</strong> to expand
        </span>
        {loading && <span className="graph-status-loading">loading…</span>}
        {truncated && (
          <span className="graph-status-warn">
            capped at {MAX_SLICE_NODES.toLocaleString()} nodes — use <strong>Data</strong> for full list
          </span>
        )}
      </div>
      <ReactFlowProvider>
        <ReactFlow
          key={documentId}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.05}
          maxZoom={1.75}
          nodesDraggable
          nodesConnectable={false}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--grid)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => minimapColor[(node.data as JsonNodeData).node.kind]}
            maskColor="rgba(8, 8, 11, 0.78)"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
