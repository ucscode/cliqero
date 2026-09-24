import { describe, expect, it } from "vitest";
import { OperatorWithdrawalService } from "@/infrastructure/postgres/operator/withdrawals";

describe("operator withdrawal projection", () => {
  it("keeps list identity concise and exposes complete destination snapshots in detail", async () => {
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
              saved_destination_id: "00000000-0000-4000-8000-000000000003",
              destination_method: "bank_ng",
              destination_method_name: "Bank account",
              destination_name: "Primary",
              destination_details: [
                {
                  name: "account_number",
                  label: "Account number",
                  value: "0123456789",
                  type: "text",
                  copyable: true,
                },
                {
                  name: "network_id",
                  label: "Network ID",
                  value: "tron-mainnet",
                  type: "hidden",
                  copyable: true,
                },
              ],
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
    expect(item.destination).toMatchObject({
      method: "bank_ng",
      methodName: "Bank account",
      name: "Primary",
      savedDestinationId: "00000000-0000-4000-8000-000000000003",
      fields: [
        { name: "account_number", value: "0123456789", copyable: true },
        { name: "network_id", value: "tron-mainnet", type: "hidden", copyable: true },
      ],
    });
    expect(item.reservation).toMatchObject({ state: "reserved", amountMinor: "4000" });
    expect(item).toMatchObject({
      externalReference: "bank-transfer-123",
      completionNote: "Sent manually",
      completedBy: "00000000-0000-4000-8000-000000000006",
      completedAt: "2026-01-02T00:00:00.000Z",
      attention: "action_required",
    });
  });

  it("keeps list results concise instead of returning snapshot field values", async () => {
    const sql = {
      query: async () => ({
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            account_id: "00000000-0000-4000-8000-000000000002",
            username: "member",
            email: "member@example.com",
            amount_minor: "4000",
            currency: "USD",
            saved_destination_id: "00000000-0000-4000-8000-000000000003",
            destination_method: "bank_ng",
            destination_method_name: "Bank account",
            destination_name: "Primary",
            destination_details: [
              {
                name: "account",
                label: "Account",
                value: "0123456789",
                type: "text",
                copyable: true,
              },
            ],
            state: "requested",
            reason: null,
            external_reference: null,
            completion_note: null,
            completed_by: null,
            completed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            reservation_id: null,
          },
        ],
      }),
    } as any;
    const page = await new OperatorWithdrawalService(sql).list({ limit: 10 });
    expect(page.items[0]?.destination).toEqual({
      method: "bank_ng",
      methodName: "Bank account",
      name: "Primary",
    });
    expect(JSON.stringify(page)).not.toContain("0123456789");
  });
});
