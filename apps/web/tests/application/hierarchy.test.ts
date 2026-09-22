import { describe, expect, it, vi } from "vitest";
import {
  HierarchyService,
  visualizationConfig,
  visualizationConfigFromValue,
} from "@/application/hierarchy";
describe("hierarchy visualization configuration", () => {
  it("requires the complete strict structure", () => {
    expect(() => visualizationConfigFromValue(null)).toThrow();
    expect(() => visualizationConfigFromValue({})).toThrow();
    expect(() => visualizationConfigFromValue({ hierarchy: {} })).toThrow();
    expect(() =>
      visualizationConfigFromValue({ hierarchy: { visualization: { depth: 3 } } }),
    ).toThrow();
    expect(() =>
      visualizationConfigFromValue({ hierarchy: { visualization: { child_limit: 50 } } }),
    ).toThrow();
  });
  it("fails clearly when the operational file is absent", () =>
    expect(() => visualizationConfig("config/does-not-exist-visualization.yaml")).toThrow(
      "Required configuration file is missing",
    ));
  it("accepts positive integer depth and child limit without a hierarchy ceiling", () => {
    expect(
      visualizationConfigFromValue({
        hierarchy: { visualization: { depth: 1000, child_limit: 125 } },
      }),
    ).toEqual({ depth: 1000, childLimit: 125 });
    expect(() =>
      visualizationConfigFromValue({ hierarchy: { visualization: { depth: 0, child_limit: 1 } } }),
    ).toThrow();
    expect(() =>
      visualizationConfigFromValue({
        hierarchy: { visualization: { depth: 1.5, child_limit: 1 } },
      }),
    ).toThrow();
  });

  it("authorizes exact-level descendant listings and passes cursor/page limits to the reader", async () => {
    const descendants = vi.fn(async () => ({ items: [], nextCursor: null }));
    const availableLevels = vi.fn(async () => [1, 2]);
    const service = new HierarchyService({
      exists: async () => true,
      isDescendantOrSelf: async () => true,
      tree: async () => ({ nodes: [], edges: [] }),
      parent: async () => null,
      children: async () => ({ parentId: "root", items: [], nextCursor: null }),
      availableLevels,
      descendants,
      search: async () => [],
    });

    await expect(
      service.descendants("requester", "root", 2, false, "cursor", 100),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(descendants).toHaveBeenCalledWith("root", 2, "cursor", 100);
    await expect(
      service.descendants("requester", "root", 11, false, undefined, 25),
    ).rejects.toThrow("level must be between 1 and 10");
    await expect(service.availableLevels("requester", "root", false)).resolves.toEqual({
      levels: [1, 2],
    });
    expect(availableLevels).toHaveBeenCalledWith("root");
  });

  it("does not allow a user to list an unrelated hierarchy root", async () => {
    const descendants = vi.fn(async () => ({ items: [], nextCursor: null }));
    const availableLevels = vi.fn(async () => [1]);
    const service = new HierarchyService({
      exists: async () => true,
      isDescendantOrSelf: async () => false,
      tree: async () => ({ nodes: [], edges: [] }),
      parent: async () => null,
      children: async () => ({ parentId: "root", items: [], nextCursor: null }),
      availableLevels,
      descendants,
      search: async () => [],
    });

    await expect(
      service.descendants("requester", "other-root", 3, false, undefined, 25),
    ).rejects.toThrow("Forbidden");
    expect(descendants).not.toHaveBeenCalled();
  });
});
