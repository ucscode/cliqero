import { describe, expect, it, vi } from "vitest";
import { resourceDeleteSchema, deleteResourceIds } from "@/api/shared/resource-delete";
import { PublicApplicationError } from "@/kernel/errors";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

describe("canonical resource deletion contract", () => {
  it("requires a non-empty array of unique valid IDs", () => {
    const schema = resourceDeleteSchema(2);
    expect(schema.safeParse({ ids: [first] }).success).toBe(true);
    expect(schema.safeParse({ ids: [first, second] }).success).toBe(true);
    expect(schema.safeParse({ ids: [] }).success).toBe(false);
    expect(schema.safeParse({ ids: [first, first] }).success).toBe(false);
    expect(schema.safeParse({ ids: [first, first.toUpperCase()] }).success).toBe(false);
    expect(schema.safeParse({ ids: ["not-a-uuid"] }).success).toBe(false);
    expect(
      schema.safeParse({ ids: [first, second, "33333333-3333-4333-8333-333333333333"] }).success,
    ).toBe(false);
    expect(schema.safeParse({ ids: [first], extra: true }).success).toBe(false);
  });

  it("uses one operation path for single and multiple IDs and preserves per-record failures", async () => {
    const remove = vi.fn(async (id: string) => {
      if (id === second) throw new Error("secret SQL constraint detail");
      return { id, deleted: true };
    });
    await expect(deleteResourceIds([first], remove)).resolves.toEqual({
      results: [{ id: first, deleted: true, error: null }],
    });
    await expect(deleteResourceIds([first, second], remove)).resolves.toEqual({
      results: [
        { id: first, deleted: true, error: null },
        { id: second, deleted: false, error: "Resource could not be deleted." },
      ],
    });
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("surfaces only branded public deletion messages", async () => {
    await expect(
      deleteResourceIds([first], () => {
        throw new PublicApplicationError("Still referenced.", "resource_conflict", 409);
      }),
    ).resolves.toEqual({
      results: [{ id: first, deleted: false, error: "Still referenced." }],
    });
    const result = await deleteResourceIds(
      [first],
      () => {
        throw new Error("secret SQL detail");
      },
      "Listing media could not be deleted.",
    );
    expect(result.results[0]).toEqual({
      id: first,
      deleted: false,
      error: "Listing media could not be deleted.",
    });
    expect(JSON.stringify(result)).not.toContain("secret SQL detail");
  });
});
