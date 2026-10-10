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
  it("returns an account-scoped cursor page alongside balances and reservations", async () => {
    const list = vi.fn(async () => ({
      items: [withdrawal],
      nextCursor: "next-cursor",
    }));
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
      withdrawals: { list },
      fundsReservation: {
        summarize: vi.fn(async () => []),
        available: vi.fn(async () => 9000n),
      },
      withdrawalPolicy: {
        getActive: vi.fn(async () => ({
          enabled: true,
          minimumAmount: Money.of(100n, "USD"),
          maximumAmount: null,
        })),
      },
    };
    const response = await withdrawalCollectionRoute.GET(
      new Request("http://localhost/api/withdrawals?limit=25&cursor=opaque-cursor"),
    );
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(withdrawal.accountId, {
      limit: 25,
      cursor: "opaque-cursor",
    });
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: withdrawal.id }],
      next_cursor: "next-cursor",
      wallet_summary: { available_minor: "9000", reservations: [] },
    });
  });

  it("accepts destination_id and rejects the legacy free-form destination contract", async () => {
    const create = vi.fn(async () => withdrawal);
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
      withdrawals: { create },
      authentication: { requireVerifiedEmail: vi.fn(async () => undefined) },
      transactionPin: { requireValidPin: vi.fn(async () => undefined) },
    };
    const valid = await withdrawalCollectionRoute.POST(
      new Request("http://localhost/api/withdrawals", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "withdrawal-1" },
        body: JSON.stringify({
          amount_minor: "1250",
          currency: "USD",
          destination_id: withdrawal.destination.savedDestinationId,
          transaction_pin: "123456",
        }),
      }),
    );
    expect(valid.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
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
    const note = await withdrawalCollectionRoute.POST(
      new Request("http://localhost/api/withdrawals", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "withdrawal-3" },
        body: JSON.stringify({
          amount_minor: "1250",
          currency: "USD",
          destination_id: withdrawal.destination.savedDestinationId,
          transaction_pin: "123456",
          note: "please expedite",
        }),
      }),
    );
    expect(note.status).toBe(400);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not expose cancellation as PATCH or DELETE on the compatibility detail", () => {
    expect("PATCH" in withdrawalRoute).toBe(false);
    expect("DELETE" in withdrawalRoute).toBe(false);
  });
});
