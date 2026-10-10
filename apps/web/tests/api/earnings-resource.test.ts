import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import * as earningsRoute from "@/api/compat/earnings/route";

describe("earnings resource", () => {
  it("keeps raw ledger balances and composes currency-aware withdrawable balances", async () => {
    const accountId = "00000000-0000-4000-8000-000000000001";
    let withdrawableUsd = 230n;
    const available = vi.fn(async (_accountId: string, currency: string) =>
      currency === "USD" ? withdrawableUsd : 450n,
    );
    fixtures.container = {
      principalResolver: {
        resolve: vi.fn(async () => ({ account: { id: accountId } })),
      },
      accountProjections: {
        earnings: vi.fn(async () => ({
          balances: [
            { currency: "USD", state: "available", amount_minor: "340" },
            { currency: "NGN", state: "available", amount_minor: "900" },
          ],
          reconciliation: {
            available_minor: "340",
            purchase_earnings_minor: "500",
            purchase_reversals_minor: "0",
            earnings_corrections_minor: "0",
            manual_adjustments_minor: "0",
            balance_transfers_minor: "0",
            funding_reversals_minor: "0",
            transfer_compensations_minor: "0",
            debt_settlements_minor: "0",
            withdrawal_reserved_minor: "0",
            completed_withdrawals_minor: "0",
            settled_purchase_earnings_minor: "0",
          },
        })),
      },
      fundsReservation: { available },
      withdrawalPolicy: {
        getActive: vi.fn(async () => ({
          enabled: true,
          minimumAmount: Money.of(100n, "USD"),
          maximumAmount: null,
        })),
      },
    };

    const getSummary = async () => {
      const response = await earningsRoute.GET(new Request("http://localhost/api/earnings"));
      expect(response.status).toBe(200);
      return response.json();
    };

    const requested = await getSummary();
    expect(requested).toEqual({
      balances: [
        { currency: "USD", state: "available", amount_minor: "340" },
        { currency: "NGN", state: "available", amount_minor: "900" },
      ],
      reconciliation: expect.objectContaining({
        available_minor: "340",
        purchase_earnings_minor: "500",
      }),
      withdrawal_currency: "USD",
      withdrawable_balances: [
        { currency: "NGN", amount_minor: "450" },
        { currency: "USD", amount_minor: "230" },
      ],
    });

    withdrawableUsd = 340n;
    expect((await getSummary()).withdrawable_balances).toContainEqual({
      currency: "USD",
      amount_minor: "340",
    });

    withdrawableUsd = 230n;
    expect((await getSummary()).withdrawable_balances).toContainEqual({
      currency: "USD",
      amount_minor: "230",
    });
    expect(available).toHaveBeenCalledWith(accountId, "USD");
    expect(available).toHaveBeenCalledWith(accountId, "NGN");
  });
});
