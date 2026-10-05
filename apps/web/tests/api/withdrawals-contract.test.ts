import { describe, expect, it } from "vitest";
import { getLegacyRouteAccess } from "@/api/legacy-dispatch";
import { presentWithdrawal, presentWithdrawalPolicy } from "@/api/compat/withdrawals/presentation";
import {
  operatorWithdrawalCompleteSchema,
  operatorWithdrawalDetailSchema,
  operatorWithdrawalPatchSchema,
} from "@/api/routes/withdrawals/contracts";
import { Money } from "@/modules/money/money";

describe("withdrawal API contract", () => {
  it("separates ordinary PATCH states from completion command metadata", () => {
    expect(operatorWithdrawalPatchSchema.safeParse({ status: "approved" }).success).toBe(true);
    expect(
      operatorWithdrawalPatchSchema.safeParse({ status: "rejected", reason: "Not eligible" })
        .success,
    ).toBe(true);
    expect(operatorWithdrawalPatchSchema.safeParse({ status: "completed" }).success).toBe(false);
    expect(
      operatorWithdrawalPatchSchema.safeParse({ status: "approved", external_reference: "x" })
        .success,
    ).toBe(false);
    expect(
      operatorWithdrawalCompleteSchema.parse({
        external_reference: "transfer-1",
        note: "Paid outside Cliqero",
      }),
    ).toEqual({ external_reference: "transfer-1", note: "Paid outside Cliqero" });
    expect(() => operatorWithdrawalCompleteSchema.parse({ status: "completed" })).toThrow();
  });

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
      payoutReturn: null,
      attention: "review",
    });
    expect(result.destination.fields[0]).toMatchObject({ type: "hidden", value: "tron-mainnet" });
  });

  it("exposes exact minor units and only a safe destination identity", () => {
    const presented = presentWithdrawal({
      id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
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
      presentWithdrawalPolicy(
        {
          enabled: true,
          minimumAmount: Money.of(1000n, "USD"),
          maximumAmount: null,
        },
        {
          enabled: true,
          withdrawal: { enabled: true, basisPoints: 500n, maximumMinor: 2000n },
          funding_to_earning: { enabled: true, basisPoints: 200n, maximumMinor: 1000n },
          earning_to_funding: { enabled: true, basisPoints: 100n, maximumMinor: 500n },
        },
      ),
    ).toEqual({
      enabled: true,
      minimum_amount_minor: "1000",
      maximum_amount_minor: null,
      currency: "USD",
      fee_enabled: true,
      fee_basis_points: "500",
      fee_maximum_amount_minor: "2000",
    });
    expect(getLegacyRouteAccess("/api/me/withdrawals/policy", "GET")).toEqual({
      mode: "account",
      scope: "withdrawals:read",
    });
  });

  it("reports fees disabled when either the global or withdrawal switch is off", () => {
    const withdrawalPolicy = {
      enabled: true,
      minimumAmount: Money.of(1000n, "USD"),
      maximumAmount: null,
    };
    const common = {
      withdrawal: { enabled: true, basisPoints: 500n, maximumMinor: 2000n },
      funding_to_earning: { enabled: true, basisPoints: 200n, maximumMinor: 1000n },
      earning_to_funding: { enabled: true, basisPoints: 100n, maximumMinor: 500n },
    };
    expect(
      presentWithdrawalPolicy(withdrawalPolicy, { enabled: false, ...common }).fee_enabled,
    ).toBe(false);
    expect(
      presentWithdrawalPolicy(withdrawalPolicy, {
        enabled: true,
        ...common,
        withdrawal: { ...common.withdrawal, enabled: false },
      }).fee_enabled,
    ).toBe(false);
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
    expect(getLegacyRouteAccess("/api/withdrawals/example", "PATCH")?.scope).toBe(
      "withdrawals:manage",
    );
  });
});
