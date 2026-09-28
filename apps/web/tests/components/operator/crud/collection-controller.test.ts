import { describe, expect, it, vi } from "vitest";
import { CrudCollectionController } from "@/components/operator/crud/collection-controller";
import type { CrudPage } from "@/components/operator/crud/use-collection";

describe("operator CRUD collection controller", () => {
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
    expect(reader.mock.calls.at(-1)).toEqual(["applied", "page-2"]);

    await controller.retry();
    expect(reader.mock.calls.at(-1)).toEqual(["applied", null]);
    reader.mockImplementation(async (filter, cursor) => ({
      items: [`${filter}:${cursor ?? "first"}`],
      nextCursor: cursor ? null : "page-2",
    }));
    await controller.next();
    expect(controller.hasPrevious).toBe(true);
    await controller.previous();
    expect(reader.mock.calls.at(-1)).toEqual(["applied", null]);
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
});
