import { describe, expect, it } from "vitest";
import { OperatorWithdrawalService } from "./operator-withdrawals";

describe("operator withdrawal projection", () => {
  it("masks destinations and exposes reservation, payout, and attention facts", async () => {
    const sql = {
      query: async (text: string) => {
        if (text.includes("select id,attempt_number"))
          return {
            rows: [
              {
                id: "00000000-0000-4000-8000-000000000003",
                attempt_number: 1,
                provider_name: "development",
                state: "unknown",
                provider_reference: "provider-ref",
                failure_category: "unknown",
                failure_reason: "No response",
                created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
                completed_at: null,
              },
            ],
          };
        return {
          rows: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              account_id: "00000000-0000-4000-8000-000000000002",
              handle: "member",
              email: "member@example.com",
              amount_minor: "4000",
              currency: "USD",
              destination_type: "manual",
              destination_reference: "secret-destination",
              state: "approved",
              reason: null,
              created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
              updated_at: new Date("2026-01-01T00:00:00Z").toISOString(),
              reservation_id: "00000000-0000-4000-8000-000000000004",
              reservation_amount_minor: "4000",
              reservation_currency: "USD",
              reservation_state: "reserved",
              payout_id: "00000000-0000-4000-8000-000000000005",
              provider_name: "development",
              payout_state: "unknown",
              attempt_count: 1,
              next_attempt_at: null,
              last_error: "No response",
              attempt_state: "unknown",
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
    expect(item.payout).toMatchObject({ state: "unknown", attemptCount: 1 });
    expect(item.attention).toBe("reconciliation");
    expect(item.attempts[0]).toMatchObject({ failureCategory: "unknown" });
  });
});
