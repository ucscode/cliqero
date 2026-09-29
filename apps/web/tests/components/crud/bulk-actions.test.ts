import { describe, expect, it, vi } from "vitest";
import { runCrudBulkAction } from "@/components/crud/bulk-actions";

describe("CRUD bulk action completion", () => {
  it("clears visible selection after a completed action and passes only its selected page items", async () => {
    const items = [{ id: "a" }, { id: "b" }];
    const action = { label: "Delete", onSelect: vi.fn(async (selected) => selected.length) };
    const clearSelection = vi.fn();

    await runCrudBulkAction(action, items, clearSelection);

    expect(action.onSelect).toHaveBeenCalledWith(items);
    expect(clearSelection).toHaveBeenCalledOnce();
  });

  it("keeps selection when an action reports that it did not complete", async () => {
    const clearSelection = vi.fn();
    await runCrudBulkAction(
      { label: "Delete", onSelect: () => false },
      [{ id: "a" }],
      clearSelection,
    );
    expect(clearSelection).not.toHaveBeenCalled();
  });
});
