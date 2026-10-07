import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "@/api/hono";

const actorId = "00000000-0000-4000-8000-000000000001";
const adjustmentId = "00000000-0000-4000-8000-000000000010";
const accountId = "00000000-0000-4000-8000-000000000002";
const item = {
  id: adjustmentId,
  accountId,
  accountUsername: "member",
  amountMinor: "100",
  reason: "Correction",
  reference: null,
  createdBy: actorId,
  createdAt: "2026-10-01T00:00:00.000Z",
  currentBalanceMinor: "100",
};

function app(principal: any, methods: Record<string, ReturnType<typeof vi.fn>>) {
  return createApiApp({
    principalResolver: { resolve: vi.fn(async () => principal) },
    earningsAdjustments: methods,
  } as any);
}
const session = (capabilities: string[]) => ({
  kind: "user_session",
  accountId: actorId,
  account: {},
  capabilities,
  scopes: new Set<string>(),
});
const apiKey = (scopes: string[]) => ({
  kind: "api_key",
  accountId: actorId,
  account: {},
  capabilities: ["finance.read", "finance.manage"],
  scopes: new Set(scopes),
});

describe("public earnings adjustment resource", () => {
  it("lists and gets immutable facts with finance.read", async () => {
    const methods = {
      list: vi.fn(async () => ({ items: [item], nextCursor: null })),
      get: vi.fn(async () => item),
      create: vi.fn(),
    };
    const api = app(session(["finance.read"]), methods);
    expect((await api.fetch(new Request("http://localhost/api/earnings/adjustments"))).status).toBe(
      200,
    );
    expect(
      (await api.fetch(new Request(`http://localhost/api/earnings/adjustments/${adjustmentId}`)))
        .status,
    ).toBe(200);
    expect(methods.list).toHaveBeenCalledOnce();
    expect(methods.get).toHaveBeenCalledWith(actorId, adjustmentId);
  });

  it("creates through EarningsAdjustmentService with finance.manage", async () => {
    const methods = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(async () => ({ adjustment: item, created: true })),
    };
    const response = await app(session(["finance.manage"]), methods).fetch(
      new Request("http://localhost/api/earnings/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "adjustment-key" },
        body: JSON.stringify({ account_id: accountId, amount_minor: "100", reason: "Correction" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(methods.create).toHaveBeenCalledWith(actorId, {
      accountId,
      amountMinor: "100",
      reason: "Correction",
      reference: undefined,
      idempotencyKey: "adjustment-key",
    });
  });

  it("requires Idempotency-Key for public creation", async () => {
    const methods = { list: vi.fn(), get: vi.fn(), create: vi.fn() };
    const response = await app(session(["finance.manage"]), methods).fetch(
      new Request("http://localhost/api/earnings/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_id: accountId, amount_minor: "100", reason: "Correction" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(methods.create).not.toHaveBeenCalled();
  });

  it("returns the existing fact as a successful replay without another creation", async () => {
    const methods = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(async () => ({ adjustment: item, created: false })),
    };
    const response = await app(session(["finance.manage"]), methods).fetch(
      new Request("http://localhost/api/earnings/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "same-adjustment" },
        body: JSON.stringify({ account_id: accountId, amount_minor: "100", reason: "Correction" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: adjustmentId });
    expect(methods.create).toHaveBeenCalledOnce();
  });

  it("enforces API-key scopes and does not expose mutation/delete routes", async () => {
    const methods = {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => item),
      create: vi.fn(async () => item),
    };
    const denied = app(apiKey(["payments:manage"]), methods);
    expect(
      (await denied.fetch(new Request("http://localhost/api/earnings/adjustments"))).status,
    ).toBe(403);
    const allowed = app(apiKey(["payments:read", "payments:manage"]), methods);
    expect(
      (await allowed.fetch(new Request("http://localhost/api/earnings/adjustments"))).status,
    ).toBe(200);
    expect(
      (
        await allowed.fetch(
          new Request(`http://localhost/api/earnings/adjustments/${adjustmentId}`, {
            method: "PATCH",
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await allowed.fetch(
          new Request("http://localhost/api/earnings/adjustments", { method: "DELETE" }),
        )
      ).status,
    ).toBe(404);
  });
});
