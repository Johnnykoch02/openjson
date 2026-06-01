import Dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import { DAGRE_LAYOUT_THRESHOLD, NODE_HEIGHT, NODE_WIDTH } from "./limits";

export { NODE_WIDTH, NODE_HEIGHT };

const GRID_COLS = 8;
const GRID_X_GAP = 280;
const GRID_Y_GAP = 80;

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Node[] {
  if (nodes.length > DAGRE_LAYOUT_THRESHOLD) {
    return layoutGrid(nodes);
  }

  const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 28, ranksep: 90, marginx: 40, marginy: 40 });

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  Dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    };
  });
}

function layoutGrid(nodes: Node[]): Node[] {
  return nodes.map((node, index) => {
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    return {
      ...node,
      position: {
        x: col * GRID_X_GAP,
        y: row * (NODE_HEIGHT + GRID_Y_GAP),
      },
    };
  });
}
