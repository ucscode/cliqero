import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "@/api/hono";
import { PublicApplicationError } from "@/kernel/errors";

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
const administrativeSummary = {
  ...adminSummary,
  origin: "administrative" as const,
  provider: null,
  providerReference: null,
  administrativeReference: "admin-ref",
  reason: "Local adjustment",
};
const administrativeDetail = {
  ...administrativeSummary,
  conversionSnapshot: null,
  providerInitialization: null,
  operations: [],
  events: [],
  evidence: null,
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
      createAdministrative: vi.fn(async () => ({ id: fundingId })),
      updateAdministrative: vi.fn(async () => undefined),
      deleteByOperator: vi.fn(async () => ({ id: fundingId, deleted: true })),
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
      items: [{ id: fundingId, provider: "bank_transfer", account: null, operator_details: null }],
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
      operator_details: null,
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

  it("includes owner-owned administrative funding in list and detail without operator fields", async () => {
    const list = vi.fn(async () => ({ items: [administrativeSummary], nextCursor: null }));
    const get = vi.fn(async () => administrativeDetail);
    const app = createApp(principal(), { operatorFunding: { list, get } });
    const collection = await app.fetch(new Request("http://localhost/api/funding-transactions"));
    expect(collection.status).toBe(200);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ accountId: ownerId }));
    expect(await collection.json()).toMatchObject({
      items: [{ origin: "administrative", provider: null, account: null, operator_details: null }],
    });
    const detail = await app.fetch(
      new Request(`http://localhost/api/funding-transactions/${fundingId}`),
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      origin: "administrative",
      provider: null,
      account: null,
      operator_details: null,
      amount_minor: "1250",
      funding_reference: "admin-ref",
    });
  });

  it("serves operator records through the same collection and detail family", async () => {
    const app = createApp(principal(["finance.read"]));
    const list = await app.fetch(new Request("http://localhost/api/funding-transactions"));
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      items: [{ account: { username: "owner" }, operator_details: { origin: "provider" } }],
    });
    const detail = await app.fetch(
      new Request(`http://localhost/api/funding-transactions/${fundingId}`),
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      account: { username: "owner" },
      operator_details: { id: fundingId },
    });
  });

  it("serves administrative detail to finance operators through the canonical item route", async () => {
    const app = createApp(principal(["finance.read"]), {
      operatorFunding: {
        get: vi.fn(async () => administrativeDetail),
      },
    });
    const response = await app.fetch(
      new Request(`http://localhost/api/funding-transactions/${fundingId}`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      origin: "administrative",
      provider: null,
      account: { id: ownerId },
      operator_details: { origin: "administrative" },
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
    expect(
      (
        await createApp(principal([], "api_key", [])).fetch(
          new Request("http://localhost/api/funding-transactions"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createApp(principal([], "api_key", ["payments:read"])).fetch(
          new Request("http://localhost/api/funding-transactions"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createApp(principal([], "api_key", ["wallet:read"])).fetch(
          new Request("http://localhost/api/funding-transactions"),
        )
      ).status,
    ).toBe(200);
  });

  it("returns stable not-found responses for missing owner, operator, and API-key reads and updates", async () => {
    const missing = vi.fn(async () => {
      throw new PublicApplicationError("Funding transaction not found.", "not_found", 404);
    });
    const cases = [
      { principal: principal(), method: "GET" },
      { principal: principal(["finance.read"]), method: "GET" },
      { principal: principal(["finance.read"], "api_key", ["payments:read"]), method: "GET" },
      { principal: principal(["finance.manage"]), method: "PATCH" },
    ] as const;

    for (const testCase of cases) {
      const response = await createApp(testCase.principal, {
        operatorFunding: { get: missing },
      }).fetch(
        new Request(`http://localhost/api/funding-transactions/${fundingId}`, {
          method: testCase.method,
          ...(testCase.method === "PATCH"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  amount_minor: "1250",
                  state: "confirmed",
                  reason: "Missing-resource regression",
                }),
              }
            : {}),
        }),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "not_found" });
    }
  });

  it("creates and updates administrative funding through the canonical resource", async () => {
    const createAdministrative = vi.fn(async () => ({ id: fundingId }));
    const get = vi.fn(async () => administrativeDetail);
    const app = createApp(principal(["finance.manage"]), {
      operatorFunding: {
        createAdministrative,
        get,
        updateAdministrative: vi.fn(async () => undefined),
      },
    });
    const created = await app.fetch(
      new Request("http://localhost/api/funding-transactions", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "admin-funding-1" },
        body: JSON.stringify({
          origin: "administrative",
          account_id: ownerId,
          amount_minor: "1250",
          state: "confirmed",
          reason: "Local adjustment",
          reference: "admin-ref",
        }),
      }),
    );
    expect(created.status).toBe(201);
    expect(createAdministrative).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({
        accountId: ownerId,
        idempotencyKey: "admin-funding-1",
      }),
    );
    const updateAdministrative = vi.fn(async () => undefined);
    const updateApp = createApp(principal(["finance.manage"]), {
      operatorFunding: { get, updateAdministrative },
    });
    const updated = await updateApp.fetch(
      new Request(`http://localhost/api/funding-transactions/${fundingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_minor: "1250", state: "confirmed", reason: "Corrected" }),
      }),
    );
    expect(updated.status).toBe(200);
    expect(updateAdministrative).toHaveBeenCalledWith(
      ownerId,
      fundingId,
      expect.objectContaining({
        reason: "Corrected",
      }),
    );
  });

  it("creates provider funding for the authenticated account through the same collection POST", async () => {
    const create = vi.fn(async () => funding);
    const app = createApp(principal(), { fundingService: { create } });
    const response = await app.fetch(
      new Request("http://localhost/api/funding-transactions", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "provider-funding-1" },
        body: JSON.stringify({ amount_minor: "1250", provider: "bank_transfer" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ accountId: ownerId }));
    expect((await response.json()).origin).toBe("provider");
  });

  it("requires both finance capability and payments:manage for administrative API-key writes", async () => {
    const makeRequest = () =>
      new Request("http://localhost/api/funding-transactions", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "admin-key-auth" },
        body: JSON.stringify({
          origin: "administrative",
          account_id: ownerId,
          amount_minor: "1250",
          state: "confirmed",
          reason: "Local adjustment",
        }),
      });
    const capabilityOnly = await createApp(principal(["finance.manage"], "api_key", [])).fetch(
      makeRequest(),
    );
    expect(capabilityOnly.status).toBe(403);
    const scopeOnly = await createApp(principal([], "api_key", ["payments:manage"])).fetch(
      makeRequest(),
    );
    expect(scopeOnly.status).toBe(403);
    const createAdministrative = vi.fn(async () => ({ id: fundingId }));
    const allowed = await createApp(principal(["finance.manage"], "api_key", ["payments:manage"]), {
      operatorFunding: { createAdministrative, get: vi.fn(async () => administrativeDetail) },
    }).fetch(makeRequest());
    expect(allowed.status).toBe(201);
    expect(createAdministrative).toHaveBeenCalledOnce();
  });

  it("deletes eligible administrative funding using collection DELETE", async () => {
    const deleteByOperator = vi.fn(async () => ({ id: fundingId, deleted: true }));
    const app = createApp(principal(["finance.manage"]), {
      operatorFunding: {
        get: vi.fn(async () => administrativeDetail),
        deleteByOperator,
      },
    });
    const response = await app.fetch(
      new Request("http://localhost/api/funding-transactions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [fundingId] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: [{ id: fundingId, deleted: true }] });
    expect(deleteByOperator).toHaveBeenCalledWith(ownerId, fundingId);
  });

  it("uses canonical bounded DELETE validation including case-insensitive UUID uniqueness", async () => {
    const app = createApp(principal(["finance.manage"]));
    const send = (ids: unknown[]) =>
      app.fetch(
        new Request("http://localhost/api/funding-transactions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        }),
      );

    for (const ids of [
      [],
      ["not-a-uuid"],
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"],
      Array.from(
        { length: 201 },
        (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      ),
    ]) {
      expect((await send(ids)).status).toBe(400);
    }
  });

  it("returns per-record canonical DELETE results without leaking internal failures", async () => {
    const failedId = "00000000-0000-4000-8000-000000000020";
    const missingId = "00000000-0000-4000-8000-000000000021";
    const get = vi.fn(async (id: string) => {
      if (id === missingId)
        throw new PublicApplicationError("Funding transaction not found.", "not_found", 404);
      if (id === fundingId || id === failedId) return administrativeDetail;
      return administrativeDetail;
    });
    const deleteByOperator = vi.fn(async (_actorId: string, id: string) => {
      if (id === failedId) throw new Error("secret SQL details");
      return { id, deleted: true as const };
    });
    const response = await createApp(principal(["finance.manage"]), {
      operatorFunding: { get, deleteByOperator },
    }).fetch(
      new Request("http://localhost/api/funding-transactions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [fundingId, failedId, missingId] }),
      }),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.results).toEqual([
      { id: fundingId, deleted: true, error: null },
      { id: failedId, deleted: false, error: "Funding could not be deleted." },
      { id: missingId, deleted: false, error: "Funding could not be deleted." },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret SQL details");
  });

  it("does not expose duplicate internal funding CRUD routes", async () => {
    const app = createApp(principal(["finance.manage"]));
    const cases = [
      ["POST", "/internal/funding"],
      ["PATCH", `/internal/funding/${fundingId}`],
      ["DELETE", `/internal/funding/${fundingId}`],
      ["POST", "/internal/funding/bulk-delete"],
    ] as const;
    for (const [method, path] of cases) {
      expect((await app.fetch(new Request(`http://localhost${path}`, { method }))).status).toBe(
        404,
      );
    }
  });

  it("rejects provider mutation and restricts provider cleanup to root", async () => {
    const updateAdministrative = vi.fn();
    const ordinaryFinance = createApp(principal(["finance.manage"]), {
      operatorFunding: { get: vi.fn(async () => adminSummary), updateAdministrative },
    });
    const patch = await ordinaryFinance.fetch(
      new Request(`http://localhost/api/funding-transactions/${fundingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_minor: "1250", state: "confirmed", reason: "Correction" }),
      }),
    );
    expect(patch.status).toBe(409);
    expect(updateAdministrative).not.toHaveBeenCalled();

    const nonRootDelete = await ordinaryFinance.fetch(
      new Request("http://localhost/api/funding-transactions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [fundingId] }),
      }),
    );
    expect(nonRootDelete.status).toBe(200);
    expect(await nonRootDelete.json()).toMatchObject({ results: [{ deleted: false }] });

    const deleteByOperator = vi.fn(async () => ({ id: fundingId, deleted: true }));
    const root = createApp(principal(["system.root"]), {
      operatorFunding: { get: vi.fn(async () => adminSummary), deleteByOperator },
    });
    const rootResponse = await root.fetch(
      new Request("http://localhost/api/funding-transactions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [fundingId] }),
      }),
    );
    expect(rootResponse.status).toBe(200);
    expect(deleteByOperator).toHaveBeenCalledWith(ownerId, fundingId);
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
