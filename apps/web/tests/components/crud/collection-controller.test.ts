import { describe, expect, it, vi } from "vitest";
import { CrudCollectionController } from "@/components/crud/collection-controller";
import { resolveCrudMaxRows } from "@/components/crud/max-rows";
import type { CrudPage } from "@/components/crud/use-collection";

describe("CRUD collection controller", () => {
  it("shares automatic initialization across React Strict Mode effect replay", async () => {
    const reader = vi.fn(async () => ({ items: ["root_user"], nextCursor: null }));
    const controller = new CrudCollectionController(reader, "");

    const firstMountEffect = controller.initialize("");
    const strictModeReplay = controller.initialize("");

    expect(strictModeReplay).toBe(firstMountEffect);
    await Promise.all([firstMountEffect, strictModeReplay]);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(controller.items).toEqual(["root_user"]);
    expect(controller.initialized).toBe(true);
  });

  it("keeps edited filters out of cursor requests until a successful apply", async () => {
    const reads: Array<{ filter: string; cursor: string | null }> = [];
    let failedFilter: string | null = null;
    const controller = new CrudCollectionController<string, string>(async (filter, cursor) => {
      reads.push({ filter, cursor });
      if (filter === failedFilter) throw new Error("filter unavailable");
      return { items: [`${filter}:${cursor ?? "first"}`], nextCursor: `${filter}-next` };
    }, "initial");

    expect(await controller.apply("alpha")).toBe(true);
    expect(await controller.next()).toBe(true);
    expect(reads.at(-1)).toEqual({ filter: "alpha", cursor: "alpha-next" });

    // Editing a draft has no effect on the controller; paging remains bound to alpha.
    const draft = "beta";
    expect(draft).toBe("beta");
    expect(await controller.next()).toBe(true);
    expect(reads.at(-1)).toEqual({ filter: "alpha", cursor: "alpha-next" });

    expect(await controller.apply("beta")).toBe(true);
    expect(controller.hasPrevious).toBe(false);
    expect(await controller.next()).toBe(true);
    expect(reads.at(-1)).toEqual({ filter: "beta", cursor: "beta-next" });

    const currentItems = controller.items;
    failedFilter = "gamma";
    expect(await controller.apply("gamma")).toBe(false);
    expect(controller.items).toBe(currentItems);
    expect(await controller.previous()).toBe(true);
    expect(reads.at(-1)).toEqual({ filter: "beta", cursor: null });
  });

  it("commits filters and resets cursor history only after a successful apply", async () => {
    const reads: Array<{ filter: string; cursor: string | null }> = [];
    let rejectNext = false;
    const controller = new CrudCollectionController(async (filter: string, cursor) => {
      reads.push({ filter, cursor });
      if (rejectNext) {
        rejectNext = false;
        throw new Error("read failed");
      }
      return { items: [filter], nextCursor: "next" } satisfies CrudPage<string>;
    }, "initial");

    expect(await controller.apply("accepted")).toBe(true);
    rejectNext = true;
    expect(await controller.apply("draft")).toBe(false);
    expect(controller.error).toBe("read failed");
    expect(await controller.next()).toBe(true);
    expect(reads.at(-1)).toEqual({ filter: "accepted", cursor: "next" });
  });

  it("restores the unfiltered first page when a search is reset", async () => {
    const reads: Array<{ search: string; cursor: string | null }> = [];
    const controller = new CrudCollectionController<string, string>(async (search, cursor) => {
      reads.push({ search, cursor });
      return { items: [search || "all accounts"], nextCursor: search ? "search-next" : null };
    }, "");

    expect(await controller.initialize("")).toBe(true);
    expect(await controller.apply("central_left_1")).toBe(true);
    expect(controller.items).toEqual(["central_left_1"]);
    expect(await controller.apply("")).toBe(true);
    expect(controller.items).toEqual(["all accounts"]);
    expect(controller.hasPrevious).toBe(false);
    expect(reads).toEqual([
      { search: "", cursor: null },
      { search: "central_left_1", cursor: null },
      { search: "", cursor: null },
    ]);
  });

  it("uses accepted filters for next, previous and retry, without mutating history on failures", async () => {
    const reader = vi.fn(async (filter: string, cursor: string | null) => {
      if (cursor === "page-2") throw new Error("page unavailable");
      return {
        items: [`${filter}:${cursor ?? "first"}`],
        nextCursor: cursor ? null : "page-2",
      };
    });
    const controller = new CrudCollectionController<string, string>(reader, "initial");
    await controller.apply("applied");
    expect(await controller.next()).toBe(false);
    expect(controller.hasPrevious).toBe(false);
    expect(reader.mock.calls.at(-1)).toEqual(["applied", "page-2", 50]);

    await controller.retry();
    expect(reader.mock.calls.at(-1)).toEqual(["applied", null, 50]);
    reader.mockImplementation(async (filter, cursor) => ({
      items: [`${filter}:${cursor ?? "first"}`],
      nextCursor: cursor ? null : "page-2",
    }));
    await controller.next();
    expect(controller.hasPrevious).toBe(true);
    await controller.previous();
    expect(reader.mock.calls.at(-1)).toEqual(["applied", null, 50]);
  });

  it("does not advance or discard cursor history after a failed Previous request", async () => {
    let failPrevious = false;
    const reads: Array<string | null> = [];
    const controller = new CrudCollectionController<string, string>(async (_filter, cursor) => {
      reads.push(cursor);
      if (failPrevious && cursor === null) throw new Error("previous unavailable");
      return { items: [cursor ?? "first"], nextCursor: cursor ? "page-3" : "page-2" };
    }, "accepted");

    await controller.apply("accepted");
    await controller.next();
    expect(controller.hasPrevious).toBe(true);
    failPrevious = true;
    expect(await controller.previous()).toBe(false);
    expect(controller.hasPrevious).toBe(true);
    expect(controller.nextCursorValue).toBe("page-3");
    await controller.retry();
    expect(reads.at(-1)).toBe("page-2");
  });

  it("does not allow overlapping page requests", async () => {
    let resolveRead!: (page: CrudPage<string>) => void;
    const reader = vi.fn(
      () =>
        new Promise<CrudPage<string>>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const controller = new CrudCollectionController(reader, "initial");
    const pending = controller.apply("accepted");
    expect(await controller.next()).toBe(false);
    resolveRead({ items: ["loaded"], nextCursor: null });
    expect(await pending).toBe(true);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it("uses one fixed maxRows limit for initial load and every cursor request", async () => {
    let fail = false;
    const sizes: number[] = [];
    const controller = new CrudCollectionController<string, string>(
      async (filter, cursor, size) => {
        sizes.push(size);
        if (fail) throw new Error("refresh unavailable");
        return { items: [`${filter}:${cursor ?? "first"}:${size}`], nextCursor: null };
      },
      "default",
      31,
    );
    expect(controller.initialized).toBe(false);
    await controller.apply("default");
    expect(controller.initialized).toBe(true);
    expect(controller.items).toEqual(["default:first:31"]);
    const accepted = controller.items;
    fail = true;
    expect(await controller.apply("new-filter")).toBe(false);
    expect(controller.items).toBe(accepted);
    expect(controller.error).toBe("refresh unavailable");
    expect(sizes).toEqual([31, 31]);
  });

  it("keeps the configured page limit on every cursor page without skipping rows", async () => {
    const requests: Array<{ cursor: string | null; limit: number }> = [];
    const reader = vi.fn(async (_filter: string, cursor: string | null, limit: number) => {
      requests.push({ cursor, limit });
      const start = cursor ? Number(cursor) : 0;
      const end = Math.min(start + limit, 50);
      return {
        items: Array.from({ length: end - start }, (_, index) => start + index + 1),
        nextCursor: end < 50 ? String(end) : null,
      };
    });
    const configuredMaxRows = resolveCrudMaxRows(25);
    const controller = new CrudCollectionController(reader, "all", configuredMaxRows);

    expect(await controller.apply("all")).toBe(true);
    const firstPage = controller.items;
    expect(firstPage).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(await controller.next()).toBe(true);

    expect(reader.mock.calls.map(([, cursor, limit]) => [cursor, limit])).toEqual([
      [null, 25],
      ["25", 25],
    ]);
    expect([...firstPage, ...controller.items]).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect(requests).toEqual([
      { cursor: null, limit: configuredMaxRows },
      { cursor: "25", limit: configuredMaxRows },
    ]);
  });

  it("uses the configured site limit when there is no collection override", async () => {
    const reader = vi.fn(async () => ({ items: ["row"], nextCursor: null }));
    const configuredMaxRows = resolveCrudMaxRows(37);
    const controller = new CrudCollectionController(reader, "all", configuredMaxRows);

    expect(await controller.apply("all")).toBe(true);
    expect(reader).toHaveBeenCalledWith("all", null, 37);
  });

  it.each([0, -1, 1.5, 201])("rejects invalid maxRows value %s", (maxRows) => {
    expect(
      () =>
        new CrudCollectionController(async () => ({ items: [], nextCursor: null }), "all", maxRows),
    ).toThrow("CRUD maxRows must be an integer between 1 and 200");
  });

  it("keeps successful empty results distinct from uninitialized collections", async () => {
    const controller = new CrudCollectionController<string, string>(
      async () => ({ items: [], nextCursor: null }),
      "default",
    );
    expect(controller.initialized).toBe(false);
    expect(await controller.apply("default")).toBe(true);
    expect(controller.initialized).toBe(true);
    expect(controller.items).toEqual([]);
  });
});
