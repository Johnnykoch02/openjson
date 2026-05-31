import { useCallback, useEffect, useMemo, useState } from "react";
import { expandGraphPath, getGraph, getValue } from "../lib/api";
import { useWorkspace } from "../stores/workspace";
import type { GraphEdge, GraphNode } from "../types";
import { ChevronRight } from "./icons";

interface TreeViewProps {
  documentId: string | null;
}

export function TreeView({ documentId }: TreeViewProps) {
  const openInspector = useWorkspace((s) => s.openInspector);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentId) {
      setNodes([]);
      setEdges([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getGraph(documentId, 1200, 2)
      .then((snapshot) => {
        if (cancelled) return;
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        setExpanded(new Set(snapshot.edges.map((e) => e.source)));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    edges.forEach((edge) => {
      const list = map.get(edge.source) ?? [];
      list.push(edge.target);
      map.set(edge.source, list);
    });
    return map;
  }, [edges]);

  const loaded = useMemo(() => new Set(edges.map((e) => e.source)), [edges]);

  const toggle = useCallback(
    async (node: GraphNode) => {
      if (expanded.has(node.id)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
        return;
      }
      if (node.expandable && !loaded.has(node.id) && documentId) {
        const snapshot = await expandGraphPath(documentId, node.path, 1200);
        setNodes((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          return [...prev, ...snapshot.nodes.filter((n) => !seen.has(n.id))];
        });
        setEdges((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...snapshot.edges.filter((e) => !seen.has(e.id))];
        });
      }
      setExpanded((prev) => new Set(prev).add(node.id));
    },
    [expanded, loaded, documentId],
  );

  const inspect = useCallback(
    async (node: GraphNode) => {
      if (!documentId) return;
      const value = await getValue(documentId, node.path);
      openInspector({
        title: node.path || node.label,
        subtitle: node.expandable ? `${node.child_count} children` : node.kind,
        value,
      });
    },
    [documentId, openInspector],
  );

  const collapseAll = useCallback(() => setExpanded(new Set(["root"])), []);
  const expandLoaded = useCallback(() => setExpanded(new Set(loaded)), [loaded]);

  const rootChildren = childrenByParent.get("root") ?? [];

  if (!documentId) return null;

  return (
    <div className="tree-view">
      <div className="tree-toolbar">
        <span className="tree-count">{nodes.length} nodes loaded</span>
        <div className="tree-toolbar-actions">
          <button className="ghost-btn" onClick={expandLoaded}>
            Expand loaded
          </button>
          <button className="ghost-btn" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
        {loading && <span className="tree-loading">loading…</span>}
      </div>

      <div className="tree-scroll">
        {rootChildren.map((childId) => (
          <TreeRow
            key={childId}
            nodeId={childId}
            depth={0}
            nodeById={nodeById}
            childrenByParent={childrenByParent}
            expanded={expanded}
            loaded={loaded}
            onToggle={toggle}
            onInspect={inspect}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeRowProps {
  nodeId: string;
  depth: number;
  nodeById: Map<string, GraphNode>;
  childrenByParent: Map<string, string[]>;
  expanded: Set<string>;
  loaded: Set<string>;
  onToggle: (node: GraphNode) => void;
  onInspect: (node: GraphNode) => void;
}

function TreeRow({
  nodeId,
  depth,
  nodeById,
  childrenByParent,
  expanded,
  loaded,
  onToggle,
  onInspect,
}: TreeRowProps) {
  const node = nodeById.get(nodeId);
  if (!node) return null;

  const isOpen = expanded.has(node.id);
  const children = childrenByParent.get(node.id) ?? [];

  return (
    <div className="tree-block">
      <div className="tree-row" style={{ paddingLeft: 10 + depth * 16 }}>
        <button
          className={`tree-caret ${node.expandable ? "" : "hidden"} ${isOpen ? "open" : ""}`}
          onClick={() => onToggle(node)}
        >
          <ChevronRight width={13} height={13} />
        </button>
        <button className="tree-entry" onClick={() => onInspect(node)} title="Inspect value">
          <span className="tree-key">{node.label}</span>
          <span className={`tree-type type-${node.kind}`}>{node.kind}</span>
          {node.value_preview && <span className="tree-preview">{node.value_preview}</span>}
        </button>
      </div>
      {isOpen && (node.expandable && (loaded.has(node.id) ? children.length > 0 : true)) && (
        <div className="tree-children">
          {children.map((childId) => (
            <TreeRow
              key={childId}
              nodeId={childId}
              depth={depth + 1}
              nodeById={nodeById}
              childrenByParent={childrenByParent}
              expanded={expanded}
              loaded={loaded}
              onToggle={onToggle}
              onInspect={onInspect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
