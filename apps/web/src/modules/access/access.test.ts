import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Entitlement } from "@/modules/entitlement/entitlement";
import { AccessGrant, AccessService } from "./access";

describe("AccessService", () => {
  it("issues an opaque credential and verifies it only for an independently authorized integration", async () => {
    const entitlement = new Entitlement("entitlement-1", "buyer-1", "listing-1", "purchase-1");
    const grants = new Map<string, AccessGrant>();
    const service = new AccessService(
      {
        findByPurchaseId: async () => entitlement,
        findActive: async (buyerId, listingId) => buyerId === entitlement.buyerId && listingId === entitlement.listingId ? entitlement : null,
        findById: async (id) => id === entitlement.id ? entitlement : null,
        save: async () => undefined,
      },
      {
        findByTokenHash: async (hash) => grants.get(hash.toString("hex")) ?? null,
        save: async (grant) => { grants.set(grant.tokenHash.toString("hex"), grant); },
      },
    );
    const { source } = await service.issue("buyer-1", "listing-1");
    expect(source).not.toContain("buyer-1");
    expect(source).not.toContain("listing-1");
    expect(source.length).toBeGreaterThanOrEqual(43);

    await expect(service.verify(source, { id: "integration-1", canVerifyListing: () => false }))
      .resolves.toEqual({ authorized: false });
    await expect(service.verify(source, { id: "integration-1", canVerifyListing: (id) => id === "listing-1" }))
      .resolves.toMatchObject({ authorized: true, listingId: "listing-1" });
  });

  it("rejects raw business identifiers and unknown tokens", async () => {
    const service = new AccessService(
      { findByPurchaseId: async () => null, findActive: async () => null, findById: async () => null, save: async () => undefined },
      { findByTokenHash: async () => null, save: async () => undefined },
    );
    const integration = { id: "integration-1", canVerifyListing: () => true };
    await expect(service.verify("purchase-1", integration)).resolves.toEqual({ authorized: false });
    expect(createHash("sha256").update("purchase-1").digest()).toHaveLength(32);
  });
});

