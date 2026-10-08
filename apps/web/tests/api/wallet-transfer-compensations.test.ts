import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "@/api/hono";
import { PublicApplicationError } from "@/kernel/errors";

const ownerId = "00000000-0000-4000-8000-000000000001";
const foreignId = "00000000-0000-4000-8000-000000000002";
const transferId = "00000000-0000-4000-8000-000000000003";
const compensationId = "00000000-0000-4000-8000-000000000004";
const compensation = {
  id: compensationId,
  transferId,
  accountId: ownerId,
  fromWallet: "funding" as const,
  toWallet: "earnings" as const,
  grossMinor: 1000n,
  feeMinor: 50n,
  netMinor: 950n,
  reason: "Transfer correction",
  recovery: {
    destinationWalletMinor: 950n,
    sourceWalletMinor: 1000n,
    feeRefundedMinor: 50n,
    debtMinor: 0n,
  },
  createdBy: foreignId,
  correlationId: "00000000-0000-4000-8000-000000000005",
  idempotencyKey: "compensation-1",
  createdAt: new Date("2026-10-08T12:00:00.000Z"),
};

function makeApp(input: {
  accountId?: string;
  kind?: "user_session" | "api_key";
  capabilities?: string[];
  scopes?: string[];
  create?: (...args: any[]) => Promise<any>;
}) {
  const principal = {
    kind: input.kind ?? "user_session",
    accountId: input.accountId ?? ownerId,
    account: { country: "NG" },
    capabilities: input.capabilities ?? [],
    scopes: new Set(input.scopes ?? []),
  };
  const get = vi.fn(async (id: string) => (id === compensationId ? compensation : null));
  const list = vi.fn(async (query: any) => ({
    items: query.accountId === ownerId ? [compensation] : [],
    nextCursor: null,
  }));
  const createByOperator = input.create ?? vi.fn(async () => compensation);
  const app = createApiApp({
    principalResolver: { resolve: vi.fn(async () => principal) },
    walletTransferCompensations: { get, list, createByOperator },
  } as any);
  return { app, get, list, createByOperator };
}

describe("wallet transfer compensation API authorization", () => {
  it("allows owner wallet reads and conceals foreign or missing IDs", async () => {
    const owner = makeApp({ kind: "api_key", scopes: ["wallet:read"] });
    expect(
      (
        await owner.app.fetch(
          new Request(`http://localhost/api/wallet-transfer-compensations/${compensationId}`),
        )
      ).status,
    ).toBe(200);
    expect(
      (await owner.app.fetch(new Request("http://localhost/api/wallet-transfer-compensations")))
        .status,
    ).toBe(200);

    const foreignOwner = makeApp({
      accountId: foreignId,
      kind: "api_key",
      scopes: ["wallet:read"],
    });
    for (const id of [compensationId, "00000000-0000-4000-8000-000000000099"]) {
      const response = await foreignOwner.app.fetch(
        new Request(`http://localhost/api/wallet-transfer-compensations/${id}`),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "not_found" });
    }
  });

  it("uses wallet:read for finance-capable owner keys and payments:read for finance operators", async () => {
    const ownerKey = makeApp({
      kind: "api_key",
      capabilities: ["finance.read"],
      scopes: ["wallet:read"],
    });
    expect(
      (
        await ownerKey.app.fetch(
          new Request(`http://localhost/api/wallet-transfer-compensations/${compensationId}`),
        )
      ).status,
    ).toBe(200);

    const operator = makeApp({
      kind: "api_key",
      accountId: foreignId,
      capabilities: ["finance.read"],
      scopes: ["payments:read"],
    });
    expect(
      (
        await operator.app.fetch(
          new Request(`http://localhost/api/wallet-transfer-compensations/${compensationId}`),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await operator.app.fetch(
          new Request(`http://localhost/api/wallet-transfer-compensations?account_id=${ownerId}`),
        )
      ).status,
    ).toBe(200);
  });

  it("does not treat finance.read alone as elevated API-key read scope", async () => {
    const ownerRead = makeApp({
      kind: "api_key",
      capabilities: ["finance.read"],
      scopes: ["wallet:read"],
    });
    expect(
      (
        await ownerRead.app.fetch(
          new Request(`http://localhost/api/wallet-transfer-compensations/${compensationId}`),
        )
      ).status,
    ).toBe(200);

    const noReadAuthority = makeApp({
      kind: "api_key",
      accountId: foreignId,
      capabilities: ["finance.read"],
      scopes: [],
    });
    const response = await noReadAuthority.app.fetch(
      new Request(`http://localhost/api/wallet-transfer-compensations/${compensationId}`),
    );
    expect(response.status).toBe(403);
  });

  it("requires finance.manage and payments:manage to create", async () => {
    const denied = makeApp({
      kind: "api_key",
      capabilities: ["finance.manage"],
      scopes: [],
    });
    expect(
      (
        await denied.app.fetch(
          new Request("http://localhost/api/wallet-transfer-compensations", {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": "key" },
            body: JSON.stringify({ transfer_id: transferId, reason: "Fix transfer" }),
          }),
        )
      ).status,
    ).toBe(403);

    const allowed = makeApp({
      kind: "api_key",
      capabilities: ["finance.manage"],
      scopes: ["payments:manage"],
    });
    const response = await allowed.app.fetch(
      new Request("http://localhost/api/wallet-transfer-compensations", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "key" },
        body: JSON.stringify({ transfer_id: transferId, reason: "Fix transfer" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: compensationId,
      transfer_id: transferId,
      recovery: { destination_wallet_minor: "950", fee_refunded_minor: "50" },
    });
  });

  it("returns classified financial conflicts from the application service", async () => {
    const app = makeApp({
      capabilities: ["finance.manage"],
      create: async () => {
        throw new PublicApplicationError(
          "This wallet transfer has already been compensated.",
          "transfer_already_compensated",
          409,
        );
      },
    });
    const response = await app.app.fetch(
      new Request("http://localhost/api/wallet-transfer-compensations", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "key" },
        body: JSON.stringify({ transfer_id: transferId, reason: "Fix transfer" }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "transfer_already_compensated" });
  });
});
