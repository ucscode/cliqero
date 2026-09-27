import { describe, expect, it, vi } from "vitest";
import { HierarchyUsernameSearch, hierarchySearchPath } from "@/components/hierarchy/search";

describe("manual hierarchy username search", () => {
  it("uses a bounded exact username query", () => {
    expect(hierarchySearchPath(" alpha_one ")).toBe(
      "/api/hierarchy/search?q=alpha_one&exact=true&limit=1",
    );
  });

  it("does not issue a request until explicitly asked and trims the submitted username", async () => {
    const fetcher = vi.fn(async () => ({ items: [] }));
    const search = new HierarchyUsernameSearch(fetcher);

    // Input changes are local UI state; only form submission calls find().
    expect(fetcher).not.toHaveBeenCalled();
    await search.find("  alpha_one  ");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/hierarchy/search?q=alpha_one&exact=true&limit=1");
  });

  it("rejects empty submissions without making a request", async () => {
    const fetcher = vi.fn(async () => ({ items: [] }));
    const search = new HierarchyUsernameSearch(fetcher);

    await expect(search.find("   ")).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns one matching identity or null without exposing extra search results", async () => {
    const match = { id: "account-1", username: "alpha_one", displayName: "Alpha" };
    const search = new HierarchyUsernameSearch(async () => ({ items: [match] }));
    await expect(search.find("alpha_one")).resolves.toEqual(match);

    const missing = new HierarchyUsernameSearch(async () => ({ items: [] }));
    await expect(missing.find("missing_user")).resolves.toBeNull();
  });

  it("keeps request failures distinct from an empty result", async () => {
    const search = new HierarchyUsernameSearch(async () => {
      throw new Error("network unavailable");
    });
    await expect(search.find("alpha_one")).rejects.toThrow("network unavailable");
  });
});
