import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getValue, listChildren } from "../lib/api";
import { copyValueToClipboard } from "../lib/clipboard";
import { DEFAULT_PAGE_SIZE } from "../lib/limits";
import { useWorkspace } from "../stores/workspace";
import type { GraphNode } from "../types";
import { ContextMenu } from "./ContextMenu";
import { ChevronRight } from "./icons";

interface TreeViewProps {
  documentId: string | null;
}

interface PageState {
  total: number;
  loaded: number;
  hasMore: boolean;
  loading: boolean;
}

const ROW_HEIGHT = 32;
const VIRTUAL_THRESHOLD = 50;

function useVirtualRange(itemCount: number, scrollTop: number, viewportHeight: number) {
  return useMemo(() => {
    if (itemCount === 0) {
      return { start: 0, end: 0, paddingTop: 0, paddingBottom: 0 };
    }
    const overscan = 10;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
    const visible = Math.ceil(viewportHeight / ROW_HEIGHT) + overscan * 2;
    const end = Math.min(itemCount, start + visible);
    return {
      start,
      end,
      paddingTop: start * ROW_HEIGHT,
      paddingBottom: Math.max(0, (itemCount - end) * ROW_HEIGHT),
    };
  }, [itemCount, scrollTop, viewportHeight]);
}

export function TreeView({ documentId }: TreeViewProps) {
  const openInspector = useWorkspace((s) => s.openInspector);
  const [nodes, setNodes] = useState<Map<string, GraphNode>>(new Map());
  const [childIds, setChildIds] = useState<Map<string, string[]>>(new Map());
  const [pagination, setPagination] = useState<Map<string, PageState>>(new Map());
  const [loadedParents, setLoadedParents] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: GraphNode;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const mergeSlice = useCallback((slice: Awaited<ReturnType<typeof listChildren>>, append: boolean) => {
    setNodes((prev) => {
      const next = new Map(prev);
      slice.nodes.forEach((node) => next.set(node.id, node));
      return next;
    });
    setChildIds((prev) => {
      const next = new Map(prev);
      const newIds = slice.nodes.map((n) => n.id);
      const existing = next.get(slice.parent_id) ?? [];
      next.set(slice.parent_id, append ? [...existing, ...newIds] : newIds);
      return next;
    });
    setPagination((prev) => {
      const next = new Map(prev);
      const existing = next.get(slice.parent_id);
      const loaded = append
        ? (existing?.loaded ?? 0) + slice.nodes.length
        : slice.nodes.length;
      next.set(slice.parent_id, {
        total: slice.total_children,
        loaded,
        hasMore: slice.has_more,
        loading: false,
      });
      return next;
    });
    setLoadedParents((prev) => new Set(prev).add(slice.parent_id));
  }, []);

  const fetchChildren = useCallback(
    async (path: string, offset: number, append: boolean) => {
      if (!documentId) return;
      const parentId = path === "" ? "root" : path.replace(/[.[\]]/g, "_");
      setPagination((prev) => {
        const next = new Map(prev);
        const current = next.get(parentId) ?? {
          total: 0,
          loaded: 0,
          hasMore: false,
          loading: false,
        };
        next.set(parentId, { ...current, loading: true });
        return next;
      });
      try {
        const slice = await listChildren(documentId, path, offset, DEFAULT_PAGE_SIZE);
        mergeSlice(slice, append);
      } finally {
        setPagination((prev) => {
          const next = new Map(prev);
          const current = next.get(parentId);
          if (current) next.set(parentId, { ...current, loading: false });
          return next;
        });
      }
    },
    [documentId, mergeSlice],
  );

  useEffect(() => {
    if (!documentId) {
      setNodes(new Map());
      setChildIds(new Map());
      setPagination(new Map());
      setLoadedParents(new Set());
      setExpanded(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    listChildren(documentId, "", 0, DEFAULT_PAGE_SIZE)
      .then((slice) => {
        if (cancelled) return;
        mergeSlice(slice, false);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [documentId, mergeSlice]);

  const rootChildIds = childIds.get("root") ?? [];
  const rootPage = pagination.get("root");
  const useVirtual = (rootPage?.total ?? rootChildIds.length) > VIRTUAL_THRESHOLD;
  const virtual = useVirtualRange(
    useVirtual ? rootChildIds.length : 0,
    scrollTop,
    viewportHeight,
  );

  const loadMore = useCallback(
    (parentId: string, path: string) => {
      const page = pagination.get(parentId);
      if (!page?.hasMore || page.loading) return;
      void fetchChildren(path, page.loaded, true);
    },
    [fetchChildren, pagination],
  );

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
      if (node.expandable && !loadedParents.has(node.id)) {
        await fetchChildren(node.path, 0, false);
      }
      setExpanded((prev) => new Set(prev).add(node.id));
    },
    [expanded, fetchChildren, loadedParents],
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

  const copyNodeValue = useCallback(
    async (node: GraphNode) => {
      if (!documentId) return;
      const value = await getValue(documentId, node.path);
      await copyValueToClipboard(value);
    },
    [documentId],
  );

  const openValueMenu = useCallback((event: React.MouseEvent, node: GraphNode) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);
  const expandLoaded = useCallback(() => setExpanded(new Set(loadedParents)), [loadedParents]);

  const onScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 6;
      if (nearBottom && rootPage?.hasMore && !rootPage.loading) {
        loadMore("root", "");
      }
    },
    [loadMore, rootPage],
  );

  const statusText = useMemo(() => {
    if (!rootPage) return loading ? "Loading…" : "";
    const { total, loaded, hasMore } = rootPage;
    if (total === 0) return "Empty document";
    if (loaded >= total) return `Showing all ${total.toLocaleString()} items`;
    return `Showing ${loaded.toLocaleString()} of ${total.toLocaleString()} items${hasMore ? " — scroll for more" : ""}`;
  }, [loading, rootPage]);

  const nodeById = nodes;

  if (!documentId) return null;

  const renderRootRow = (childId: string) => (
    <TreeRow
      key={childId}
      nodeId={childId}
      depth={0}
      nodeById={nodeById}
      childIds={childIds}
      expanded={expanded}
      loadedParents={loadedParents}
      pagination={pagination}
      onToggle={toggle}
      onInspect={inspect}
      onValueContextMenu={openValueMenu}
      onLoadMore={loadMore}
    />
  );

  return (
    <div className="tree-view">
      <div className="tree-toolbar">
        <span className="tree-count">{statusText}</span>
        <div className="tree-toolbar-actions">
          <button className="ghost-btn" type="button" onClick={expandLoaded}>
            Expand loaded
          </button>
          <button className="ghost-btn" type="button" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
        {loading && <span className="tree-loading">loading…</span>}
      </div>

      <div className="tree-scroll" ref={scrollRef} onScroll={onScroll}>
        {useVirtual ? (
          <div style={{ height: rootChildIds.length * ROW_HEIGHT, position: "relative" }}>
            <div style={{ transform: `translateY(${virtual.paddingTop}px)` }}>
              {rootChildIds.slice(virtual.start, virtual.end).map(renderRootRow)}
            </div>
          </div>
        ) : (
          rootChildIds.map(renderRootRow)
        )}
        {rootPage?.hasMore && (
          <button
            className="tree-load-more"
            type="button"
            disabled={rootPage.loading}
            onClick={() => loadMore("root", "")}
          >
            {rootPage.loading ? "Loading…" : `Load more (${rootPage.loaded} / ${rootPage.total})`}
          </button>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: "Copy to clipboard",
              onClick: () => void copyNodeValue(contextMenu.node),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

interface TreeRowProps {
  nodeId: string;
  depth: number;
  nodeById: Map<string, GraphNode>;
  childIds: Map<string, string[]>;
  expanded: Set<string>;
  loadedParents: Set<string>;
  pagination: Map<string, PageState>;
  onToggle: (node: GraphNode) => void;
  onInspect: (node: GraphNode) => void;
  onValueContextMenu: (event: React.MouseEvent, node: GraphNode) => void;
  onLoadMore: (parentId: string, path: string) => void;
}

function TreeRow({
  nodeId,
  depth,
  nodeById,
  childIds,
  expanded,
  loadedParents,
  pagination,
  onToggle,
  onInspect,
  onValueContextMenu,
  onLoadMore,
}: TreeRowProps) {
  const node = nodeById.get(nodeId);
  if (!node) return null;

  const isOpen = expanded.has(node.id);
  const children = childIds.get(node.id) ?? [];
  const page = pagination.get(node.id);

  return (
    <div className="tree-block">
      <div className="tree-row" style={{ paddingLeft: 10 + depth * 16, minHeight: ROW_HEIGHT }}>
        <button
          className={`tree-caret ${node.expandable ? "" : "hidden"} ${isOpen ? "open" : ""}`}
          type="button"
          onClick={() => onToggle(node)}
        >
          <ChevronRight width={13} height={13} />
        </button>
        <button
          className="tree-entry"
          type="button"
          onClick={() => onInspect(node)}
          title="Inspect value"
        >
          <span className="tree-key">{node.label}</span>
          <span className={`tree-type type-${node.kind}`}>{node.kind}</span>
          {node.value_preview ? (
            <span
              className="tree-preview"
              onContextMenu={(event) => onValueContextMenu(event, node)}
            >
              {node.value_preview}
            </span>
          ) : (
            !node.expandable && (
              <span
                className="tree-preview tree-preview-empty"
                onContextMenu={(event) => onValueContextMenu(event, node)}
              >
                —
              </span>
            )
          )}
        </button>
      </div>
      {isOpen && node.expandable && (
        <div className="tree-children">
          {children.map((childId) => (
            <TreeRow
              key={childId}
              nodeId={childId}
              depth={depth + 1}
              nodeById={nodeById}
              childIds={childIds}
              expanded={expanded}
              loadedParents={loadedParents}
              pagination={pagination}
              onToggle={onToggle}
              onInspect={onInspect}
              onValueContextMenu={onValueContextMenu}
              onLoadMore={onLoadMore}
            />
          ))}
          {page?.hasMore && (
            <button
              className="tree-load-more nested"
              type="button"
              style={{ marginLeft: 10 + (depth + 1) * 16 }}
              disabled={page.loading}
              onClick={() => onLoadMore(node.id, node.path)}
            >
              {page.loading
                ? "Loading…"
                : `Load more (${page.loaded} / ${page.total})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
