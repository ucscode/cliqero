import { describe, expect, it } from "vitest";
import { Purchase } from "./purchase";

describe("Purchase", () => {
  it("keeps an immutable commercial snapshot", () => {
    const terms = {
      listingId: "listing-1", sellerId: "seller-1", title: "Original title",
      price: { minorAmount: "2000", currency: "NGN" },
      canonicalPrice: { minorAmount: "125", currency: "USD" as const },
      referralAttributionId: null,
      referralLinkId: null,
      referralReferrerAccountId: null,
    };
    const purchase = new Purchase("purchase-1", "buyer-1", "payment-1", terms, "provider:event-1");
    expect(() => { (terms.price as { minorAmount: string }).minorAmount = "1"; }).toThrow();
    expect(purchase.terms.price.minorAmount).toBe("2000");
  });

  it("rejects invalid lifecycle transitions", () => {
    const purchase = new Purchase("purchase-1", "buyer-1", "payment-1", {
      listingId: "listing-1", sellerId: "seller-1", title: "Listing",
      price: { minorAmount: "100", currency: "USD" }, canonicalPrice: { minorAmount: "100", currency: "USD" },
      referralAttributionId: null,
      referralLinkId: null,
      referralReferrerAccountId: null,
    }, "provider:event-1");
    expect(() => purchase.complete()).toThrow("Only a paid purchase can be completed");
  });
});
