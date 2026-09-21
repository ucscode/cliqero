import { describe, expect, it } from "vitest";
import { layoutHierarchyGraph } from "@/components/hierarchy/graph/layout";
import type { HierarchyGraph } from "@/components/hierarchy/graph/model";

const graph: HierarchyGraph = {
  nodes: [
    {
      id: "outside",
      parentId: null,
      role: "context-parent",
      depth: -1,
      label: "Outside",
      username: "outside",
      displayName: null,
      isSelf: false,
      isRoot: false,
      directChildCount: 1,
      hasChildren: true,
      hasMoreChildren: false,
      nextChildCursor: null,
      canLoadMoreChildren: false,
      canNavigate: false,
    },
    {
      id: "root",
      parentId: "outside",
      role: "root",
      depth: 0,
      label: "Root",
      username: "root",
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
      role: "member",
      depth: 1,
      label: "B",
      username: "b",
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
      role: "member",
      depth: 1,
      label: "A",
      username: "a",
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
    { id: "outside:root", source: "outside", target: "root" },
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
    const parent = first.nodes.find((node) => node.id === "outside")!;
    expect(parent.position.y).toBeLessThan(root.position.y);
    for (const child of first.nodes.filter((node) => node.parentId === "root")) {
      expect(root.position.y).toBeLessThan(child.position.y);
    }
  });
});
