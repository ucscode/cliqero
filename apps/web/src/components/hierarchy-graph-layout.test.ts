import { describe, expect, it } from "vitest";
import { layoutHierarchyGraph } from "./hierarchy-graph-layout";
import type { HierarchyGraph } from "./hierarchy-graph-model";

const graph: HierarchyGraph = {
  nodes: [
    {
      id: "root",
      parentId: null,
      depth: 0,
      label: "Root",
      handle: "root",
      displayName: "Root",
      isSelf: true,
      isRoot: true,
      directChildCount: 2,
      hasChildren: true,
      hasMoreChildren: false,
      nextChildCursor: null,
      canLoadMoreChildren: true,
      canNavigate: false,
    },
    {
      id: "b",
      parentId: "root",
      depth: 1,
      label: "B",
      handle: "b",
      displayName: null,
      isSelf: false,
      isRoot: false,
      directChildCount: 0,
      hasChildren: false,
      hasMoreChildren: false,
      nextChildCursor: null,
      canLoadMoreChildren: true,
      canNavigate: true,
    },
    {
      id: "a",
      parentId: "root",
      depth: 1,
      label: "A",
      handle: "a",
      displayName: null,
      isSelf: false,
      isRoot: false,
      directChildCount: 0,
      hasChildren: false,
      hasMoreChildren: false,
      nextChildCursor: null,
      canLoadMoreChildren: true,
      canNavigate: true,
    },
  ],
  edges: [
    { id: "root:b", source: "root", target: "b" },
    { id: "root:a", source: "root", target: "a" },
  ],
};

describe("hierarchy graph layout", () => {
  it("is deterministic and places parents above children", () => {
    const first = layoutHierarchyGraph(graph);
    const second = layoutHierarchyGraph(graph);
    expect(first.nodes.map((node) => [node.id, node.position])).toEqual(
      second.nodes.map((node) => [node.id, node.position]),
    );
    const root = first.nodes.find((node) => node.id === "root")!;
    for (const child of first.nodes.filter((node) => node.parentId === "root")) {
      expect(root.position.y).toBeLessThan(child.position.y);
    }
  });
});
