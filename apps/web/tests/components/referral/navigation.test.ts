import { describe, expect, it, vi } from "vitest";
import {
  fetchHierarchyTree,
  hierarchyTreePath,
  pushReferralHistory,
  replaceReferralHistory,
  referralHistoryUrl,
  referralRootFromUrl,
  runHierarchyRebase,
} from "@/components/referral/navigation";

describe("referral hierarchy navigation", () => {
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
    const current = "http://localhost:3000/dashboard?section=referrals&tab=network#graph";
    expect(referralHistoryUrl(current, "central-left")).toBe(
      "/dashboard?section=referrals&tab=network&root=central-left#graph",
    );
    expect(
      referralHistoryUrl(
        "http://localhost:3000/dashboard?section=referrals&tab=network&root=old#graph",
        null,
      ),
    ).toBe("/dashboard?section=referrals&tab=network#graph");
    expect(referralRootFromUrl("http://localhost:3000/dashboard?root=central-left")).toBe(
      "central-left",
    );
  });

  it("uses pushState without creating a route navigation", () => {
    const pushState = vi.fn();
    pushReferralHistory(
      "central-left",
      { pushState },
      "http://localhost:3000/dashboard?section=referrals",
    );
    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/dashboard?section=referrals&root=central-left",
    );
  });

  it("can replace a failed traversal without adding a history entry", () => {
    const replaceState = vi.fn();
    replaceReferralHistory(
      null,
      { replaceState },
      "http://localhost:3000/dashboard?section=referrals&root=failed",
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/dashboard?section=referrals");
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
