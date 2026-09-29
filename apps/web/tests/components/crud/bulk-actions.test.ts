import { describe, expect, it, vi } from "vitest";
import {
  assertUniqueCrudBulkActionValues,
  canApplyCrudBulkAction,
  formatCrudSelectedCount,
  runCrudBulkAction,
} from "@/components/crud/bulk-actions";

describe("CRUD bulk action completion", () => {
  it("clears visible selection after a completed action and passes only its selected page items", async () => {
    const items = [{ id: "a" }, { id: "b" }];
    const action = {
      value: "delete",
      label: "Delete",
      onSelect: vi.fn(async (selected) => selected.length),
    };
    const clearSelection = vi.fn();

    await runCrudBulkAction(action, items, clearSelection);

    expect(action.onSelect).toHaveBeenCalledWith(items);
    expect(clearSelection).toHaveBeenCalledOnce();
  });

  it("keeps selection when an action reports that it did not complete", async () => {
    const clearSelection = vi.fn();
    await runCrudBulkAction(
      { value: "delete", label: "Delete", onSelect: () => false },
      [{ id: "a" }],
      clearSelection,
    );
    expect(clearSelection).not.toHaveBeenCalled();
  });

  it("requires distinct stable action values", () => {
    expect(() =>
      assertUniqueCrudBulkActionValues([
        { value: "delete", label: "Delete", onSelect: () => undefined },
        { value: "delete", label: "Remove", onSelect: () => undefined },
      ]),
    ).toThrow("Duplicate CRUD bulk action value: delete");
  });

  it("does not execute an action until the apply operation runs", async () => {
    const onSelect = vi.fn();
    const selectedActionValue = "publish";
    expect(selectedActionValue).toBe("publish");
    expect(onSelect).not.toHaveBeenCalled();
    await runCrudBulkAction(
      { value: selectedActionValue, label: "Publish", onSelect },
      [{ id: "a" }],
      vi.fn(),
    );
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("requires rows, a selected action, and an idle state before enabling Apply", () => {
    expect(canApplyCrudBulkAction(0, "delete", false)).toBe(false);
    expect(canApplyCrudBulkAction(2, "", false)).toBe(false);
    expect(canApplyCrudBulkAction(2, "delete", true)).toBe(false);
    expect(canApplyCrudBulkAction(2, "delete", false)).toBe(true);
    expect(formatCrudSelectedCount(0)).toBe("0 items selected");
    expect(formatCrudSelectedCount(1)).toBe("1 item selected");
    expect(formatCrudSelectedCount(8)).toBe("8 items selected");
  });
});
