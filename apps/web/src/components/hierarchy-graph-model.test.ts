import { describe, expect, it } from "vitest";
import { hierarchyGraphFromTree, mergeHierarchyChildren } from "./hierarchy-graph-model";
import type { HierarchyTree } from "@/lib/api-client";

const tree: HierarchyTree = {
  root: "root",
  windowDepth: 3,
  childLimit: 2,
  parent: { id: "outside", handle: "outside", displayName: null, canNavigate: false },
  nodes: [
    {
      id: "child",
      handle: "child",
      displayName: "Child",
      depth: 1,
      directChildCount: 1,
      hasChildren: true,
      hasMoreChildren: false,
      nextChildCursor: null,
    },
    {
      id: "root",
      handle: "root",
      displayName: null,
      depth: 0,
      directChildCount: 1,
      hasChildren: true,
      hasMoreChildren: false,
      nextChildCursor: null,
    },
  ],
  edges: [{ parent: "root", child: "child" }],
};

describe("hierarchy graph view model", () => {
  it("marks the current root and authenticated account without changing edges", () => {
    const graph = hierarchyGraphFromTree(tree, "root");
    expect(graph.nodes.find((node) => node.id === "root")).toMatchObject({
      isRoot: true,
      isSelf: true,
      label: "root",
    });
    expect(graph.edges).toEqual([{ id: "root:child", source: "root", target: "child" }]);
  });

  it("merges child batches idempotently and advances depth", () => {
    const merged = mergeHierarchyChildren(tree, {
      parentId: "child",
      items: [
        {
          id: "grandchild",
          handle: "grandchild",
          displayName: null,
          depth: 1,
          directChildCount: 0,
          hasChildren: false,
          hasMoreChildren: false,
          nextChildCursor: null,
        },
      ],
      nextCursor: null,
    });
    const mergedAgain = mergeHierarchyChildren(merged, {
      parentId: "child",
      items: [merged.nodes.find((node) => node.id === "grandchild")!],
      nextCursor: null,
    });
    expect(mergedAgain.nodes.filter((node) => node.id === "grandchild")).toHaveLength(1);
    expect(mergedAgain.nodes.find((node) => node.id === "grandchild")?.depth).toBe(2);
    expect(mergedAgain.edges.filter((edge) => edge.child === "grandchild")).toHaveLength(1);
  });
});
