import { describe, expect, it } from "vitest";
import { getLegacyRouteAccess } from "@/api/legacy-dispatch";
import { presentWithdrawal, presentWithdrawalPolicy } from "@/api/compat/withdrawals/presentation";
import { operatorWithdrawalDetailSchema } from "@/api/routes/operator/withdrawal/contracts";
import { Money } from "@/modules/money/money";

describe("withdrawal API contract", () => {
  it("accepts hidden server-owned fields in operator withdrawal details", () => {
    const result = operatorWithdrawalDetailSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      account: {
        id: "00000000-0000-4000-8000-000000000002",
        username: "member",
        email: null,
      },
      amountMinor: "1000",
      currency: "USD",
      destination: {
        method: "bank_ng",
        methodName: "Bank account",
        name: "Primary",
        savedDestinationId: "00000000-0000-4000-8000-000000000003",
        fields: [
          {
            name: "network_id",
            label: "Network ID",
            value: "tron-mainnet",
            type: "hidden",
            copyable: true,
          },
        ],
      },
      state: "requested",
      reason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      reservation: null,
      externalReference: null,
      completionNote: null,
      completedBy: null,
      completedAt: null,
      attention: "review",
    });
    expect(result.destination.fields[0]).toMatchObject({ type: "hidden", value: "tron-mainnet" });
  });

  it("exposes exact minor units and only a safe destination identity", () => {
    const presented = presentWithdrawal({
      id: "withdrawal",
      accountId: "account",
      amount: Money.of(1250n, "USD"),
      destination: {
        savedDestinationId: "saved-destination",
        method: "bank_ng",
        methodName: "Bank account",
        name: "Primary",
        fields: [
          {
            name: "account",
            label: "Account",
            value: "destination-secret-1234",
            type: "text",
            copyable: true,
          },
        ],
      },
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
      destination: { method: "bank_ng", method_name: "Bank account", name: "Primary" },
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

  it("applies existing read/create scopes to methods, destinations, and withdrawals", () => {
    expect(getLegacyRouteAccess("/api/withdrawal-methods", "GET")?.scope).toBe("withdrawals:read");
    expect(getLegacyRouteAccess("/api/withdrawal-destinations", "GET")?.scope).toBe(
      "withdrawals:read",
    );
    expect(getLegacyRouteAccess("/api/withdrawal-destinations", "POST")?.scope).toBe(
      "withdrawals:create",
    );
    expect(getLegacyRouteAccess("/api/withdrawal-destinations/example", "PATCH")?.scope).toBe(
      "withdrawals:create",
    );
    expect(getLegacyRouteAccess("/api/withdrawal-destinations/example", "GET")?.scope).toBe(
      "withdrawals:read",
    );
    expect(getLegacyRouteAccess("/api/withdrawals", "GET")?.scope).toBe("withdrawals:read");
    expect(getLegacyRouteAccess("/api/withdrawals", "POST")?.scope).toBe("withdrawals:create");
  });
});
