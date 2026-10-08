import { describe, expect, it, vi } from "vitest";
import { createApiApp, generateOpenApiDocument } from "@/api/hono";

const actorId = "e13eebc1-562a-4bc5-9518-f25b0cfa06ca";
const sourceEntryId = "983df5b7-fc27-4d5b-b808-42db75ed7625";
const correctionId = "5f3f11aa-5eec-4f25-a5d3-d5a83fc91d91";
const correction = {
  id: correctionId,
  accountId: "00000000-0000-4000-8000-000000000002",
  accountUsername: "seller",
  sourceEntryId,
  purchaseId: "b936dc61-a752-49cb-8fae-5b8d3530e951",
  distributionId: "04473279-fcc7-4d75-b25e-ea2860a9a4c1",
  amountMinor: "2500",
  pendingMinor: "0",
  availableMinor: "1800",
  debtMinor: "700",
  reason: "Correct referral allocation after review",
  createdBy: actorId,
  createdByUsername: "finance_operator",
  correlationId: correctionId,
  idempotencyKey: "earning-correction-2026-001",
  createdAt: "2026-10-08T12:30:00.000Z",
};

function app(principal: any, methods: Record<string, ReturnType<typeof vi.fn>>) {
  return createApiApp({
    principalResolver: { resolve: vi.fn(async () => principal) },
    earningsCorrections: methods,
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

describe("source-linked Earnings correction resource", () => {
  it("lists and gets immutable corrections with finance.read", async () => {
    const methods = {
      list: vi.fn(async () => ({ items: [correction], nextCursor: null })),
      get: vi.fn(async () => correction),
      create: vi.fn(),
    };
    const api = app(session(["finance.read"]), methods);
    const listResponse = await api.fetch(
      new Request(`http://localhost/api/earnings/corrections?source_entry_id=${sourceEntryId}`),
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({ items: [correction] });
    const detailResponse = await api.fetch(
      new Request(`http://localhost/api/earnings/corrections/${correctionId}`),
    );
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject(correction);
    expect(methods.list).toHaveBeenCalledWith(actorId, {
      sourceEntryId,
      cursor: undefined,
      limit: expect.any(Number),
    });
    expect(methods.get).toHaveBeenCalledWith(actorId, correctionId);
  });

  it("creates only against the source ID and uses the authenticated operator as actor", async () => {
    const methods = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(async () => ({ correction, created: true })),
    };
    const response = await app(session(["finance.manage"]), methods).fetch(
      new Request("http://localhost/api/earnings/corrections", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "correct-earning-1" },
        body: JSON.stringify({
          source_entry_id: sourceEntryId,
          amount_minor: "2500",
          reason: "Correct referral allocation after review",
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(methods.create).toHaveBeenCalledWith(actorId, {
      sourceEntryId,
      amountMinor: "2500",
      reason: "Correct referral allocation after review",
      idempotencyKey: "correct-earning-1",
    });
  });

  it("rejects caller-supplied ownership and enforces API-key scopes", async () => {
    const methods = { list: vi.fn(), get: vi.fn(), create: vi.fn() };
    const api = app(apiKey(["payments:manage"]), methods);
    const denied = await api.fetch(
      new Request(`http://localhost/api/earnings/corrections?source_entry_id=${sourceEntryId}`),
    );
    expect(denied.status).toBe(403);
    const extraOwner = await app(session(["finance.manage"]), methods).fetch(
      new Request("http://localhost/api/earnings/corrections", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "correct-earning-2" },
        body: JSON.stringify({
          account_id: actorId,
          source_entry_id: sourceEntryId,
          amount_minor: "100",
          reason: "Invalid caller-selected owner",
        }),
      }),
    );
    expect(extraOwner.status).toBe(400);
    expect(methods.create).not.toHaveBeenCalled();
  });

  it("documents collection, item, and create as immutable-resource operations", () => {
    const methods = { list: vi.fn(), get: vi.fn(), create: vi.fn() };
    const api = app(session(["finance.read", "finance.manage"]), methods);
    const document = generateOpenApiDocument(api as any) as any;
    const collection = document.paths["/api/earnings/corrections"]!;
    const item = document.paths["/api/earnings/corrections/{correctionId}"]!;
    expect(Object.keys(collection)).toEqual(expect.arrayContaining(["get", "post"]));
    expect(Object.keys(item)).toEqual(["get"]);
    expect(collection.get.tags).toEqual(["Earnings Corrections"]);
    expect(
      collection.post.requestBody.content["application/json"].schema.properties,
    ).toHaveProperty("source_entry_id");
    expect(collection.post.responses["201"].content["application/json"].schema.type).toBe("object");
    expect(
      collection.get.responses["200"].content["application/json"].schema.properties,
    ).toHaveProperty("items");
    expect(collection.get.security).toEqual([{ CliqeroApiKey: [] }]);
  });
});
