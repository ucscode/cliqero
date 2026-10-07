import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "@/api/hono";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const fundingId = "00000000-0000-4000-8000-000000000010";
const adminSummary = {
  id: fundingId,
  account: { id: ownerId, username: "owner", email: "owner@example.test" },
  origin: "provider" as const,
  provider: "bank_transfer",
  providerReference: "bank-ref",
  providerTransactionId: null,
  reason: null,
  administrativeReference: null,
  createdBy: null,
  canonicalAmountMinor: "1250",
  canonicalCurrency: "USD" as const,
  collectionAmountMinor: "1250",
  collectionCurrency: "USD",
  state: "awaiting_payment" as const,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  confirmedAt: null,
  walletCredit: null,
  walletEffect: null,
};
const funding = {
  id: fundingId,
  accountId: ownerId,
  providerName: "bank_transfer",
  providerReference: "bank-ref",
  canonicalAmount: { minorAmount: 1250n, currency: "USD" },
  collectionAmount: { minorAmount: 1250n, currency: "USD" },
  state: "awaiting_payment",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  confirmedAt: null,
  providerInitialization: {
    providerDisplayName: "Bank Transfer",
    providerAccountSnapshot: { id: "acct", collectionCurrency: "USD", fields: [] },
  },
};

function createApp(principal: any, overrides: Record<string, any> = {}) {
  return createApiApp({
    principalResolver: { resolve: vi.fn(async () => principal) },
    funding: {
      findById: vi.fn(async () => funding),
      findHistoryForAccount: vi.fn(async () => ({ items: [funding], nextCursor: null })),
    },
    providers: {
      displayName: (name: string) => name,
      customerActionLabel: () => null,
      availableMethodsFor: () => [],
    },
    walletRepository: { findCreditByFunding: vi.fn(async () => null) },
    operatorFunding: {
      list: vi.fn(async () => ({ items: [adminSummary], nextCursor: null })),
      get: vi.fn(async () => ({
        ...adminSummary,
        conversionSnapshot: null,
        providerInitialization: null,
        operations: [],
        events: [],
        evidence: null,
      })),
    },
    fundingCreditReconciliation: {
      reconcile: vi.fn(async () => ({
        fundingId,
        creditId: otherId,
        state: "available",
        applied: true,
      })),
    },
    ...overrides,
  } as any);
}
const principal = (
  capabilities: string[] = [],
  kind: "user_session" | "api_key" = "user_session",
  scopes: string[] = [],
) => ({
  kind,
  accountId: ownerId,
  account: { country: "NG" },
  capabilities,
  scopes: new Set(scopes),
});

describe("canonical funding transaction resource", () => {
  it("keeps owner reads scoped to the authenticated account", async () => {
    const app = createApp(principal());
    const response = await app.fetch(new Request("http://localhost/api/funding-transactions"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ id: fundingId, provider: "bank_transfer", account: null, administrative: null }],
    });
  });

  it("gets owner funding detail and hides another account's transaction as not found", async () => {
    const findById = vi.fn(async () => funding);
    const own = createApp(principal(), {
      funding: { findById, findHistoryForAccount: vi.fn() },
    });
    const response = await own.fetch(
      new Request(`http://localhost/api/funding-transactions/${fundingId}`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: fundingId,
      account: null,
      administrative: null,
    });

    const otherAccount = createApp(principal([], "user_session", []), {
      principalResolver: { resolve: vi.fn(async () => ({ ...principal(), accountId: otherId })) },
      funding: { findById, findHistoryForAccount: vi.fn() },
    });
    expect(
      (
        await otherAccount.fetch(
          new Request(`http://localhost/api/funding-transactions/${fundingId}`),
        )
      ).status,
    ).toBe(404);
  });

  it("serves operator records through the same collection and detail family", async () => {
    const app = createApp(principal(["finance.read"]));
    const list = await app.fetch(new Request("http://localhost/api/funding-transactions"));
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      items: [{ account: { username: "owner" }, administrative: { origin: "provider" } }],
    });
    const detail = await app.fetch(
      new Request(`http://localhost/api/funding-transactions/${fundingId}`),
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      account: { username: "owner" },
      administrative: { id: fundingId },
    });
  });

  it("requires the finance scope for API-key operator reads", async () => {
    expect(
      (
        await createApp(principal(["finance.read"], "api_key", [])).fetch(
          new Request("http://localhost/api/funding-transactions"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createApp(principal(["finance.read"], "api_key", ["payments:read"])).fetch(
          new Request("http://localhost/api/funding-transactions"),
        )
      ).status,
    ).toBe(200);
  });

  it("uses the canonical idempotent reconcile-credit route", async () => {
    const reconcile = vi.fn(async () => ({
      fundingId,
      creditId: otherId,
      state: "available" as const,
      applied: true,
    }));
    const app = createApp(principal(["finance.manage"]), {
      fundingCreditReconciliation: { reconcile },
    });
    const response = await app.fetch(
      new Request(`http://localhost/api/funding-transactions/${fundingId}/reconcile-credit`, {
        method: "POST",
        headers: { "Idempotency-Key": "credit-repair-1" },
      }),
    );
    expect(response.status).toBe(200);
    expect(reconcile).toHaveBeenCalledWith({
      actorId: ownerId,
      fundingId,
      idempotencyKey: "credit-repair-1",
    });
  });

  it("does not route removed funding aliases", async () => {
    const app = createApp(principal());
    for (const path of [
      "/api/funding",
      "/api/funding/00000000-0000-4000-8000-000000000010",
      "/api/wallet/funding/prepare",
      "/api/bank-transfer/funding-transactions/00000000-0000-4000-8000-000000000010/evidence",
      "/api/direct-trc20/funding-transactions/00000000-0000-4000-8000-000000000010/transaction",
    ]) {
      expect((await app.fetch(new Request(`http://localhost${path}`))).status, path).toBe(404);
    }
  });
});
