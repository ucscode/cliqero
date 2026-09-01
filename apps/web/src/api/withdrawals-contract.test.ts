import { describe, expect, it } from "vitest";
import { getLegacyRouteAccess } from "./legacy-dispatch";
import { presentWithdrawal, presentWithdrawalPolicy } from "./compat/withdrawals/presentation";
import { Money } from "@/modules/money/money";

describe("withdrawal API contract", () => {
  it("exposes exact minor units and masks destination details", () => {
    const presented = presentWithdrawal({
      id: "withdrawal",
      accountId: "account",
      amount: Money.of(1250n, "USD"),
      destinationType: "manual",
      destinationReference: "destination-secret-1234",
      state: "requested",
      idempotencyKey: "key",
      correlationId: "correlation",
      reason: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
    });
    expect(presented).toMatchObject({
      amount_minor: "1250",
      currency: "USD",
      destination_summary: "••••1234",
      state: "requested",
    });
    expect(JSON.stringify(presented)).not.toContain("destination-secret");
  });

  it("exposes the authoritative withdrawal policy and scope", () => {
    expect(
      presentWithdrawalPolicy({
        enabled: true,
        minimumAmount: Money.of(1000n, "USD"),
        maximumAmount: null,
      }),
    ).toEqual({
      enabled: true,
      minimum_amount_minor: "1000",
      maximum_amount_minor: null,
      currency: "USD",
    });
    expect(getLegacyRouteAccess("/api/withdrawals/policy", "GET")).toEqual({
      mode: "account",
      scope: "withdrawals:read",
    });
  });
});
