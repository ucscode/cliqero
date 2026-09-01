import dagre from "@dagrejs/dagre";
import type {
  HierarchyGraph,
  HierarchyGraphEdge,
  HierarchyGraphNode,
} from "./hierarchy-graph-model";

export type PositionedHierarchyNode = HierarchyGraphNode & {
  position: { x: number; y: number };
};

export type HierarchyLayout = {
  nodes: PositionedHierarchyNode[];
  edges: HierarchyGraphEdge[];
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 112;

export function layoutHierarchyGraph(graph: HierarchyGraph): HierarchyLayout {
  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  layout.setGraph({ rankdir: "TB", ranksep: 72, nodesep: 36, marginx: 36, marginy: 36 });
  for (const node of [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    layout.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of [...graph.edges].sort((left, right) => left.id.localeCompare(right.id))) {
    layout.setEdge(edge.source, edge.target);
  }
  dagre.layout(layout);
  return {
    nodes: graph.nodes.map((node) => {
      const positioned = layout.node(node.id);
      return {
        ...node,
        position: {
          x: positioned.x - NODE_WIDTH / 2,
          y: positioned.y - NODE_HEIGHT / 2,
        },
      };
    }),
    edges: graph.edges,
  };
}

export const hierarchyGraphNodeSize = { width: NODE_WIDTH, height: NODE_HEIGHT };
