import { describe, expect, it } from "vitest";
import { PostgresPurchaseRepository } from "@/infrastructure/postgres/purchase/repository";
import { Purchase } from "@/modules/purchase/purchase";

describe("PostgresPurchaseRepository listing snapshots", () => {
  it("persists and restores both description snapshots", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const repository = new PostgresPurchaseRepository({
      query: async <T extends object>(sql: string, values: readonly unknown[] = []) => {
        calls.push({ sql, values });
        return {
          rows: [
            {
              id: "purchase-1",
              buyer_id: "buyer-1",
              seller_id: "seller-1",
              listing_id: "listing-1",
              payment_id: "payment-1",
              checkout_id: null,
              idempotency_key: "purchase:key-1",
              listing_title_snapshot: "Listing",
              listing_short_description_snapshot: "Original summary",
              listing_long_description_snapshot: "Original details",
              price_minor_snapshot: "100",
              price_currency_snapshot: "USD",
              canonical_minor_snapshot: "100",
              canonical_currency_snapshot: "USD",
              referral_attribution_id: null,
              referral_referrer_account_id: null,
              state: "pending",
            } as T,
          ],
          rowCount: 1,
        };
      },
    });
    const purchase = new Purchase(
      "purchase-1",
      "buyer-1",
      "payment-1",
      {
        listingId: "listing-1",
        sellerId: "seller-1",
        title: "Listing",
        shortDescription: "Original summary",
        longDescription: "Original details",
        price: { minorAmount: "100", currency: "USD" },
        canonicalPrice: { minorAmount: "100", currency: "USD" },
        referralAttributionId: null,
        referralReferrerAccountId: null,
      },
      "purchase:key-1",
    );

    await repository.save(purchase);
    const restored = await repository.findById("purchase-1");

    expect(calls[0]?.sql).toContain(
      "listing_short_description_snapshot,listing_long_description_snapshot",
    );
    expect(calls[0]?.values).toContain("Original summary");
    expect(calls[0]?.values).toContain("Original details");
    expect(restored?.terms.shortDescription).toBe("Original summary");
    expect(restored?.terms.longDescription).toBe("Original details");
  });
});
