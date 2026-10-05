import { describe, expect, it, vi } from "vitest";
import { resourceDeleteSchema, deleteResourceIds } from "@/api/shared/resource-delete";

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
      if (id === second) throw new Error("Still referenced");
      return { id, deleted: true };
    });
    await expect(deleteResourceIds([first], remove)).resolves.toEqual({
      results: [{ id: first, deleted: true, error: null }],
    });
    await expect(deleteResourceIds([first, second], remove)).resolves.toEqual({
      results: [
        { id: first, deleted: true, error: null },
        { id: second, deleted: false, error: "Still referenced" },
      ],
    });
    expect(remove).toHaveBeenCalledTimes(3);
  });
});
