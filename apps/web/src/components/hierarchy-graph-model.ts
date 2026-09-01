import type { HierarchyChildren, HierarchyNode, HierarchyTree } from "@/lib/api-client";

export type HierarchyGraphNode = {
  id: string;
  parentId: string | null;
  depth: number;
  label: string;
  handle: string;
  displayName: string | null;
  isSelf: boolean;
  isRoot: boolean;
  directChildCount: number;
  hasChildren: boolean;
  hasMoreChildren: boolean;
  nextChildCursor: string | null;
  canLoadMoreChildren: boolean;
};

export type HierarchyGraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type HierarchyGraph = {
  nodes: HierarchyGraphNode[];
  edges: HierarchyGraphEdge[];
};

function nodeParentMap(tree: HierarchyTree) {
  return new Map(tree.edges.map((edge) => [edge.child, edge.parent]));
}

function toGraphNode(
  node: HierarchyNode,
  tree: HierarchyTree,
  selfAccountId: string,
  parentMap: Map<string, string>,
): HierarchyGraphNode {
  return {
    id: node.id,
    parentId: parentMap.get(node.id) ?? null,
    depth: node.depth,
    label: node.displayName || node.handle,
    handle: node.handle,
    displayName: node.displayName,
    isSelf: node.id === selfAccountId,
    isRoot: node.id === tree.root,
    directChildCount: node.directChildCount,
    hasChildren: node.hasChildren,
    hasMoreChildren: node.hasMoreChildren,
    nextChildCursor: node.nextChildCursor,
    canLoadMoreChildren: node.depth < tree.windowDepth,
  };
}

export function hierarchyGraphFromTree(tree: HierarchyTree, selfAccountId: string): HierarchyGraph {
  const parentMap = nodeParentMap(tree);
  const nodes = [...tree.nodes]
    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id))
    .map((node) => toGraphNode(node, tree, selfAccountId, parentMap));
  const edges = [...tree.edges]
    .sort(
      (left, right) =>
        left.parent.localeCompare(right.parent) || left.child.localeCompare(right.child),
    )
    .map((edge) => ({
      id: `${edge.parent}:${edge.child}`,
      source: edge.parent,
      target: edge.child,
    }));
  return { nodes, edges };
}

export function mergeHierarchyChildren(
  tree: HierarchyTree,
  page: HierarchyChildren,
): HierarchyTree {
  const parent = tree.nodes.find((node) => node.id === page.parentId);
  if (!parent) return tree;
  const existing = new Map(tree.nodes.map((node) => [node.id, node]));
  const existingEdges = new Map(tree.edges.map((edge) => [`${edge.parent}:${edge.child}`, edge]));
  for (const child of page.items) {
    existing.set(child.id, { ...child, depth: parent.depth + 1 });
    existingEdges.set(`${page.parentId}:${child.id}`, {
      parent: page.parentId,
      child: child.id,
    });
  }
  const nodes = [...existing.values()].map((node) =>
    node.id === page.parentId
      ? {
          ...node,
          hasMoreChildren: page.nextCursor !== null,
          nextChildCursor: page.nextCursor,
        }
      : node,
  );
  return {
    ...tree,
    nodes,
    edges: [...existingEdges.values()],
  };
}
