import { describe, expect, it } from "vitest";
import { Purchase } from "@/modules/purchase/purchase";
import { CommissionDistributionService, CommissionPolicy } from "@/modules/referral/commission";

function paidPurchase() {
  const purchase = new Purchase(
    "purchase",
    "buyer",
    null,
    {
      listingId: "listing",
      sellerId: "seller",
      title: "Listing",
      shortDescription: "Summary",
      longDescription: "Description",
      price: { minorAmount: "10000", currency: "USD" },
      canonicalPrice: { minorAmount: "10000", currency: "USD" },
      referralAttributionId: "listing-attribution",
      referralReferrerAccountId: "listing-promoter",
    },
    "purchase-idempotency",
  );
  purchase.markPaid();
  return purchase;
}

describe("hierarchy commission calculation", () => {
  it("uses buyer uplines, not listing attribution, and preserves sparse configured levels", async () => {
    const service = new CommissionDistributionService({
      assignParent: async () => undefined,
      reassignParent: async () => ({ changed: false, previousParentId: null }),
      getUplines: async () => [
        { accountId: "level-one", depth: 1 },
        { accountId: "level-two", depth: 2 },
        { accountId: "level-three", depth: 3 },
      ],
      getDirectReferrals: async () => ({ accounts: [], nextCursor: null }),
      getDownlineAtDepth: async () => ({ accounts: [], nextCursor: null }),
      getRelationshipDepth: async () => null,
    });
    const policy = CommissionPolicy.fromPercentages(
      [
        { level: 3, percentage: 5 },
        { level: 1, percentage: 20 },
      ],
      10,
    );
    const facts = await service.calculate(paidPurchase(), policy);
    expect(
      facts.map((fact) => [fact.level, fact.recipientAccountId, fact.calculatedAmount.minorAmount]),
    ).toEqual([
      [1, "level-one", 2000n],
      [3, "level-three", 500n],
    ]);
    expect(facts.every((fact) => fact.basis === "hierarchy-commission")).toBe(true);
  });

  it("records an explicit configured level without a recipient for platform allocation", async () => {
    const service = new CommissionDistributionService({
      assignParent: async () => undefined,
      reassignParent: async () => ({ changed: false, previousParentId: null }),
      getUplines: async () => [{ accountId: "level-one", depth: 1 }],
      getDirectReferrals: async () => ({ accounts: [], nextCursor: null }),
      getDownlineAtDepth: async () => ({ accounts: [], nextCursor: null }),
      getRelationshipDepth: async () => null,
    });
    const policy = CommissionPolicy.fromPercentages(
      [
        { level: 1, percentage: 20 },
        { level: 3, percentage: 5 },
      ],
      10,
    );
    const facts = await service.calculate(paidPurchase(), policy);
    expect(facts.map((fact) => [fact.level, fact.recipientAccountId])).toEqual([
      [1, "level-one"],
      [3, null],
    ]);
  });
});
