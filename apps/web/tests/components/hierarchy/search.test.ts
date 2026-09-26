import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HierarchySearchController,
  hierarchySearchPath,
  moveHierarchySearchSelection,
} from "@/components/hierarchy/search";

describe("hierarchy username search", () => {
  afterEach(() => vi.useRealTimers());

  it("requires two characters, debounces for 300ms, and requests at most ten results", async () => {
    vi.useFakeTimers();
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `id-${index}`,
      username: `person_${index}`,
      displayName: null,
    }));
    const fetcher = vi.fn(async () => ({ items }));
    const controller = new HierarchySearchController(fetcher);
    const report = vi.fn();

    controller.schedule("a", report);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).not.toHaveBeenCalled();

    controller.schedule("al", report);
    await vi.advanceTimersByTimeAsync(299);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() =>
      expect(report).toHaveBeenLastCalledWith({ status: "success", items: items.slice(0, 10) }),
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/hierarchy/search?q=al&limit=10",
      expect.any(AbortSignal),
    );
  });

  it("cancels a pending query and ignores a stale in-flight response", async () => {
    vi.useFakeTimers();
    let resolveSearch!: (value: {
      items: Array<{ id: string; username: string; displayName: null }>;
    }) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<{ items: Array<{ id: string; username: string; displayName: null }> }>(
          (resolve) => {
            resolveSearch = resolve;
          },
        ),
    );
    const controller = new HierarchySearchController(fetcher);
    const staleReport = vi.fn();
    const latestReport = vi.fn();
    controller.schedule("al", staleReport);
    await vi.advanceTimersByTimeAsync(300);
    controller.schedule("alpha", latestReport);
    resolveSearch({ items: [{ id: "old", username: "alpha_old", displayName: null }] });
    await Promise.resolve();
    expect(staleReport).not.toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
    await vi.advanceTimersByTimeAsync(300);
    expect(fetcher).toHaveBeenCalledTimes(2);
    controller.cancel();
  });

  it("supports wrapping keyboard selection and keeps an encoded, bounded query path", () => {
    expect(hierarchySearchPath(" alpha one ")).toBe("/api/hierarchy/search?q=alpha+one&limit=10");
    expect(moveHierarchySearchSelection(-1, 1, 3)).toBe(0);
    expect(moveHierarchySearchSelection(0, -1, 3)).toBe(2);
    expect(moveHierarchySearchSelection(2, 1, 3)).toBe(0);
    expect(moveHierarchySearchSelection(0, 1, 0)).toBe(-1);
  });

  it("reports search failures separately from completed empty results", async () => {
    vi.useFakeTimers();
    const controller = new HierarchySearchController(async () => ({ items: [] }));
    const report = vi.fn();
    controller.schedule("missing", report);
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    expect(report).toHaveBeenLastCalledWith({ status: "success", items: [] });

    const failing = new HierarchySearchController(async () => {
      throw new Error("search unavailable");
    });
    failing.schedule("broken", report);
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    expect(report).toHaveBeenLastCalledWith({ status: "error", message: "search unavailable" });
    controller.cancel();
    failing.cancel();
  });
});
