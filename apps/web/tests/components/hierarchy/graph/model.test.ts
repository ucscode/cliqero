import { describe, expect, it } from "vitest";
import {
  hierarchyGraphFromTree,
  hierarchyNodeAccessibleLabel,
  hierarchyNodeNavigationTarget,
  mergeHierarchyChildren,
} from "@/components/hierarchy/graph/model";
import type { HierarchyTree } from "@/lib/api-client";

const tree: HierarchyTree = {
  root: "root",
  windowDepth: 3,
  childLimit: 2,
  parent: { id: "outside", username: "outside", displayName: null, canNavigate: false },
  nodes: [
    {
      id: "child",
      username: "child",
      displayName: "Child",
      depth: 1,
      directChildCount: 1,
      hasChildren: true,
      hasMoreChildren: false,
      nextChildCursor: null,
    },
    {
      id: "root",
      username: "root",
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
  it("adds a non-persisted context parent and keeps the source tree unchanged", () => {
    const original = structuredClone(tree);
    const graph = hierarchyGraphFromTree(tree, "root");
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.find((node) => node.id === "outside")).toMatchObject({
      role: "context-parent",
      parentId: null,
      depth: -1,
      canNavigate: false,
    });
    expect(graph.nodes.find((node) => node.id === "root")).toMatchObject({
      role: "root",
      isRoot: true,
      isSelf: true,
      label: "root",
      parentId: "outside",
    });
    expect(graph.edges).toEqual([
      { id: "outside:root", source: "outside", target: "root" },
      { id: "root:child", source: "root", target: "child" },
    ]);
    expect(tree).toEqual(original);
  });

  it("allows navigation only for navigable members and context parents", () => {
    const graph = hierarchyGraphFromTree(tree, "root");
    expect(hierarchyNodeNavigationTarget(graph.nodes.find((node) => node.id === "outside")!)).toBe(
      null,
    );
    expect(hierarchyNodeNavigationTarget(graph.nodes.find((node) => node.id === "root")!)).toBe(
      null,
    );
    expect(hierarchyNodeNavigationTarget(graph.nodes.find((node) => node.id === "child")!)).toBe(
      "child",
    );

    const navigableParent = hierarchyGraphFromTree(
      { ...tree, parent: { ...tree.parent!, canNavigate: true } },
      "root",
    );
    expect(
      hierarchyNodeNavigationTarget(navigableParent.nodes.find((node) => node.id === "outside")!),
    ).toBe("outside");
  });

  it("uses role-aware accessible labels without exposing a negative generation", () => {
    const graph = hierarchyGraphFromTree(tree, "root");
    const parent = graph.nodes.find((node) => node.id === "outside")!;
    const root = graph.nodes.find((node) => node.id === "root")!;
    const child = graph.nodes.find((node) => node.id === "child")!;

    expect(hierarchyNodeAccessibleLabel(parent)).toBe("outside, parent context");
    expect(hierarchyNodeAccessibleLabel(parent)).not.toContain("generation -1");
    expect(hierarchyNodeAccessibleLabel(root)).toBe("root, current root");
    expect(hierarchyNodeAccessibleLabel(child)).toBe("Child, generation 1");
  });

  it("merges child batches idempotently and advances depth", () => {
    const merged = mergeHierarchyChildren(tree, {
      parentId: "child",
      items: [
        {
          id: "grandchild",
          username: "grandchild",
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
