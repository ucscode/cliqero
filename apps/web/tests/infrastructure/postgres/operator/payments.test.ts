import { describe, expect, it, vi } from "vitest";
import { PostgresOperatorPaymentReader } from "@/infrastructure/postgres/operator/payments";

describe("PostgresOperatorPaymentReader", () => {
  it("rejects malformed cursors as a client error before querying", async () => {
    const query = vi.fn();
    const reader = new PostgresOperatorPaymentReader({ query });

    await expect(reader.list({ limit: 10, cursor: "not-a-cursor" })).rejects.toMatchObject({
      code: "invalid_cursor",
      status: 400,
    });
    expect(query).not.toHaveBeenCalled();
  });
});
