import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import * as withdrawalRoute from "@/api/compat/withdrawals/[id]/route";
import * as withdrawalCollectionRoute from "@/api/compat/withdrawals/route";

const withdrawal = {
  id: "00000000-0000-4000-8000-000000000010",
  accountId: "00000000-0000-4000-8000-000000000001",
  amount: Money.of(1250n, "USD"),
  destination: {
    savedDestinationId: "00000000-0000-4000-8000-000000000020",
    method: "bank_ng",
    methodName: "Bank account",
    name: "Primary",
    fields: [],
  },
  state: "cancelled" as const,
  idempotencyKey: "withdrawal-key",
  correlationId: "withdrawal-correlation",
  reason: "Cancelled by account",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:01.000Z"),
};

describe("owner withdrawal resource mutation", () => {
  it("accepts destination_id and rejects the legacy free-form destination contract", async () => {
    const request = vi.fn(async () => withdrawal);
    fixtures.container = {
      principalResolver: {
        resolve: vi.fn(async () => ({
          accountId: withdrawal.accountId,
          account: { id: withdrawal.accountId },
          kind: "user_session",
          capabilities: [],
          scopes: new Set<string>(),
        })),
      },
      withdrawals: { request },
    };
    const valid = await withdrawalCollectionRoute.POST(
      new Request("http://localhost/api/withdrawals", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "withdrawal-1" },
        body: JSON.stringify({
          amount_minor: "1250",
          currency: "USD",
          destination_id: withdrawal.destination.savedDestinationId,
        }),
      }),
    );
    expect(valid.status).toBe(201);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: withdrawal.accountId,
        amountMinor: 1250n,
        currency: "USD",
        destinationId: withdrawal.destination.savedDestinationId,
      }),
    );

    const legacy = await withdrawalCollectionRoute.POST(
      new Request("http://localhost/api/withdrawals", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "withdrawal-2" },
        body: JSON.stringify({
          amount_minor: "1250",
          currency: "USD",
          destination_type: "manual",
          destination_reference: "free-form",
        }),
      }),
    );
    expect(legacy.status).toBe(400);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("cancels through PATCH and retains no DELETE command", async () => {
    const cancel = vi.fn(async () => withdrawal);
    fixtures.container = {
      principalResolver: {
        resolve: vi.fn(async () => ({
          accountId: withdrawal.accountId,
          account: { id: withdrawal.accountId },
          kind: "user_session",
          capabilities: [],
          scopes: new Set<string>(),
        })),
      },
      withdrawals: { cancel },
    };

    const response = await withdrawalRoute.PATCH(
      new Request("http://localhost/api/withdrawals/withdrawal", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      }),
      { params: Promise.resolve({ id: withdrawal.id }) },
    );

    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith(withdrawal.accountId, withdrawal.id);
    expect("DELETE" in withdrawalRoute).toBe(false);
  });

  it("requires withdrawals:create for API-key cancellation", async () => {
    const cancel = vi.fn(async () => withdrawal);
    fixtures.container = {
      principalResolver: {
        resolve: vi.fn(async () => ({
          accountId: withdrawal.accountId,
          account: { id: withdrawal.accountId },
          kind: "api_key",
          capabilities: [],
          scopes: new Set<string>(),
        })),
      },
      withdrawals: { cancel },
    };

    const response = await withdrawalRoute.PATCH(
      new Request("http://localhost/api/withdrawals/withdrawal", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      }),
      { params: Promise.resolve({ id: withdrawal.id }) },
    );

    expect(response.status).toBe(403);
    expect(cancel).not.toHaveBeenCalled();
  });
});
