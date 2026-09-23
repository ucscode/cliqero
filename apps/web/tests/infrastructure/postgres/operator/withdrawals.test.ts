import { describe, expect, it } from "vitest";
import { OperatorWithdrawalService } from "@/infrastructure/postgres/operator/withdrawals";

describe("operator withdrawal projection", () => {
  it("masks destinations and exposes reservation and manual completion facts", async () => {
    const sql = {
      query: async () => {
        return {
          rows: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              account_id: "00000000-0000-4000-8000-000000000002",
              username: "member",
              email: "member@example.com",
              amount_minor: "4000",
              currency: "USD",
              destination_type: "manual",
              destination_reference: "secret-destination",
              state: "approved",
              reason: null,
              external_reference: "bank-transfer-123",
              completion_note: "Sent manually",
              completed_by: "00000000-0000-4000-8000-000000000006",
              completed_at: new Date("2026-01-02T00:00:00Z"),
              created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
              updated_at: new Date("2026-01-01T00:00:00Z").toISOString(),
              reservation_id: "00000000-0000-4000-8000-000000000004",
              reservation_amount_minor: "4000",
              reservation_currency: "USD",
              reservation_state: "reserved",
            },
          ],
        };
      },
    } as any;
    const item = await new OperatorWithdrawalService(sql).get(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(item.destination.summary).toBe("••••tion");
    expect(item.reservation).toMatchObject({ state: "reserved", amountMinor: "4000" });
    expect(item).toMatchObject({
      externalReference: "bank-transfer-123",
      completionNote: "Sent manually",
      completedBy: "00000000-0000-4000-8000-000000000006",
      completedAt: "2026-01-02T00:00:00.000Z",
      attention: "action_required",
    });
  });
});
