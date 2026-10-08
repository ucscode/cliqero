import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "@/api/hono";
import { PublicApplicationError } from "@/kernel/errors";

const ownerId = "00000000-0000-4000-8000-000000000001";
const foreignId = "00000000-0000-4000-8000-000000000002";
const reversalId = "00000000-0000-4000-8000-000000000003";
const missingId = "00000000-0000-4000-8000-000000000004";
const reversal = {
  id: reversalId,
  fundingId: "00000000-0000-4000-8000-000000000010",
  accountId: ownerId,
  amountMinor: "100",
  currency: "USD" as const,
  providerCollectionAmountMinor: null,
  providerCollectionCurrency: null,
  source: "operator" as const,
  reason: "Audit fixture",
  providerReference: null,
  providerEventId: null,
  idempotencyKey: "audit-fixture",
  correlationId: "00000000-0000-4000-8000-000000000020",
  createdBy: ownerId,
  actorSystem: null,
  recovery: {
    pendingCreditMinor: "0",
    fundingWalletMinor: "100",
    earningsWalletMinor: "0",
    debtMinor: "0",
  },
  createdAt: new Date("2026-10-01T00:00:00Z"),
};

function makeApp(input: {
  accountId?: string;
  kind?: "user_session" | "api_key";
  capabilities?: string[];
  scopes?: string[];
  list?: (...args: any[]) => Promise<any>;
}) {
  const principal = {
    kind: input.kind ?? "user_session",
    accountId: input.accountId ?? ownerId,
    account: { country: "NG" },
    capabilities: input.capabilities ?? [],
    scopes: new Set(input.scopes ?? []),
  };
  const list = vi.fn(async (query: any) => ({
    items: query.accountId === ownerId || !query.accountId ? [reversal] : [],
    nextCursor: null,
  }));
  const listPage = input.list ?? list;
  const app = createApiApp({
    principalResolver: { resolve: vi.fn(async () => principal) },
    fundingReversals: {
      list: listPage,
      get: vi.fn(async (id: string) => (id === missingId ? null : reversal)),
    },
  } as any);
  return { app, list };
}

describe("funding reversal read authorization", () => {
  it("permits owner sessions and wallet-scoped owner API keys", async () => {
    for (const options of [
      {},
      { kind: "api_key" as const, scopes: ["wallet:read"] },
      { kind: "api_key" as const, capabilities: ["finance.read"], scopes: ["wallet:read"] },
    ]) {
      const { app } = makeApp(options);
      expect(
        (await app.fetch(new Request(`http://localhost/api/funding-reversals/${reversalId}`)))
          .status,
      ).toBe(200);
      expect((await app.fetch(new Request("http://localhost/api/funding-reversals"))).status).toBe(
        200,
      );
    }
  });

  it("permits finance operators only with finance capability and payments scope", async () => {
    const { app } = makeApp({
      kind: "api_key",
      accountId: foreignId,
      capabilities: ["finance.read"],
      scopes: ["payments:read"],
    });
    expect(
      (await app.fetch(new Request(`http://localhost/api/funding-reversals/${reversalId}`))).status,
    ).toBe(200);
    expect(
      (await app.fetch(new Request("http://localhost/api/funding-reversals?account_id=" + ownerId)))
        .status,
    ).toBe(200);
  });

  it("hides foreign and missing reversal identifiers alike for owner access", async () => {
    const { app } = makeApp({ accountId: foreignId, scopes: ["wallet:read"] });
    for (const id of [reversalId, missingId]) {
      const response = await app.fetch(new Request(`http://localhost/api/funding-reversals/${id}`));
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "not_found" });
    }
  });

  it("does not use a foreign account filter to expand an owner-only collection", async () => {
    const { app, list } = makeApp({ scopes: ["wallet:read"] });
    const response = await app.fetch(
      new Request(`http://localhost/api/funding-reversals?account_id=${foreignId}`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], next_cursor: null });
    expect(list).not.toHaveBeenCalled();
  });

  it("returns a classified 400 for malformed opaque cursors", async () => {
    const { app } = makeApp({
      scopes: ["wallet:read"],
      list: async () => {
        throw new PublicApplicationError("Invalid funding reversal cursor.", "invalid_cursor", 400);
      },
    });
    const response = await app.fetch(
      new Request("http://localhost/api/funding-reversals?cursor=not-a-valid-cursor"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_cursor" });
  });
});
