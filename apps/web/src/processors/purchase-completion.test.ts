import { describe, expect, it } from "vitest";
import type { DomainEvent } from "@/kernel/events";
import { Purchase } from "@/modules/purchase/purchase";
import type { Entitlement } from "@/modules/entitlement/entitlement";
import { PurchaseCompletionProcessor } from "./purchase-completion";

describe("PurchaseCompletionProcessor", () => {
  it("creates one purchase and entitlement when completion is retried", async () => {
    const purchases = new Map<string, Purchase>();
    const entitlements = new Map<string, Entitlement>();
    const events: DomainEvent[] = [];
    const processor = new PurchaseCompletionProcessor(
      {
        findById: async (id) => [...purchases.values()].find((purchase) => purchase.id === id) ?? null,
        findByIdempotencyKey: async (key) => purchases.get(key) ?? null,
        save: async (purchase) => { purchases.set(purchase.idempotencyKey, purchase); },
      },
      {
        findByPurchaseId: async (purchaseId) => [...entitlements.values()].find((item) => item.purchaseId === purchaseId) ?? null,
        findActive: async () => null,
        findById: async (id) => entitlements.get(id) ?? null,
        save: async (entitlement) => { entitlements.set(entitlement.id, entitlement); },
      },
      { append: async (newEvents) => { events.push(...newEvents); } },
      { transaction: async (operation) => operation() },
    );
    const makePurchase = () => new Purchase("purchase-1", "buyer-1", "payment-1", {
      listingId: "listing-1", sellerId: "seller-1", title: "Listing",
      price: { minorAmount: "100", currency: "USD" }, canonicalPrice: { minorAmount: "100", currency: "USD" },
      referralAttributionId: null,
      referralLinkId: null,
      referralReferrerAccountId: null,
    }, "paystack:event-1");

    const first = await processor.complete(makePurchase(), "correlation-1");
    const retried = await processor.complete(makePurchase(), "correlation-1");

    expect(retried.id).toBe(first.id);
    expect(purchases).toHaveLength(1);
    expect(entitlements).toHaveLength(1);
    expect(events.map((event) => event.name)).toEqual(["purchase.completed", "entitlement.created"]);
  });
});
