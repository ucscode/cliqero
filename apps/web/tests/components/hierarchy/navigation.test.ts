import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchHierarchyTree,
  hierarchyHistoryUrl,
  hierarchyRootFromUrl,
  hierarchyTreePath,
  pushHierarchyHistory,
  replaceHierarchyHistory,
  runHierarchyRebase,
} from "@/components/hierarchy/navigation";

const source = readFileSync(
  resolve(process.cwd(), "src/components/hierarchy/navigation.ts"),
  "utf8",
);

describe("hierarchy navigation", () => {
  it("builds only the hierarchy request for a visual root", async () => {
    const fetcher = vi.fn(async (path: string) => ({ path })) as unknown as Parameters<
      typeof fetchHierarchyTree
    >[1];

    expect(hierarchyTreePath("central left")).toBe("/api/hierarchy/tree?root=central%20left");
    await fetchHierarchyTree("central-left", fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/hierarchy/tree?root=central-left");
  });

  it("preserves unrelated query state while changing only the visual root", () => {
    const current = "http://localhost:3000/dashboard?section=hierarchy&tab=network#graph";
    expect(hierarchyHistoryUrl(current, "central-left")).toBe(
      "/dashboard?section=hierarchy&tab=network&root=central-left#graph",
    );
    expect(
      hierarchyHistoryUrl(
        "http://localhost:3000/dashboard?section=hierarchy&tab=network&root=old#graph",
        null,
      ),
    ).toBe("/dashboard?section=hierarchy&tab=network#graph");
    expect(hierarchyRootFromUrl("http://localhost:3000/dashboard?root=central-left")).toBe(
      "central-left",
    );
  });

  it("uses pushState without creating a route navigation", () => {
    const pushState = vi.fn();
    pushHierarchyHistory(
      "central-left",
      { pushState },
      "http://localhost:3000/dashboard?section=hierarchy",
    );
    expect(pushState).toHaveBeenCalledOnce();
    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/dashboard?section=hierarchy&root=central-left",
    );
  });

  it("can replace a failed traversal without adding a history entry", () => {
    const replaceState = vi.fn();
    replaceHierarchyHistory(
      null,
      { replaceState },
      "http://localhost:3000/dashboard?section=hierarchy&root=failed",
    );
    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/dashboard?section=hierarchy");
  });

  it("uses the supplied Next-compatible history methods directly", () => {
    expect(source).toContain('history.pushState(null, "", hierarchyHistoryUrl(href, rootId))');
    expect(source).toContain('history.replaceState(null, "", hierarchyHistoryUrl(href, rootId))');
    expect(source).not.toContain("Object.getPrototypeOf");
    expect(source).not.toContain("History.prototype");
  });

  it("replaces the tree only after a successful hierarchy load", async () => {
    const events: string[] = [];
    const tree = { nodes: [{ id: "central-left" }] };

    await expect(
      runHierarchyRebase(async () => tree, {
        setTree: (next) => events.push(`tree:${next.nodes[0]?.id}`),
        setLoading: (loading) => events.push(`loading:${loading}`),
        onSuccess: () => events.push("success"),
        onError: () => events.push("error"),
      }),
    ).resolves.toBe(true);

    expect(events).toEqual(["loading:true", "tree:central-left", "success", "loading:false"]);
  });

  it("keeps the current tree when hierarchy loading fails", async () => {
    const events: string[] = [];

    await expect(
      runHierarchyRebase(
        async () => {
          throw new Error("network failure");
        },
        {
          setTree: () => events.push("tree"),
          setLoading: (loading) => events.push(`loading:${loading}`),
          onSuccess: () => events.push("success"),
          onError: (cause) => events.push(`error:${(cause as Error).message}`),
        },
      ),
    ).resolves.toBe(false);

    expect(events).toEqual(["loading:true", "error:network failure", "loading:false"]);
  });
});
