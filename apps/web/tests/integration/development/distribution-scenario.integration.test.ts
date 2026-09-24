import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { DevelopmentDistributionScenario } from "@/infrastructure/development/distribution-scenario";
import { newId } from "@/kernel/ids";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("development distribution scenario PostgreSQL path", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(
      `truncate table treasury_capability.entries,ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.reversals,ledger_capability.purchase_distributions,
       payment_capability.reconciliation_attempts,payment_capability.provider_events,payment_capability.payments,
       wallet_capability.debits,wallet_capability.credits,checkout_capability.checkouts,
       funding_capability.funding_transactions,referral_capability.listing_attributions,referral_capability.account_referrals,
       access_capability.access_grants,entitlement_capability.entitlements,purchase_capability.purchases,
       listing_capability.listings,identity_capability.sessions,identity_capability.accounts,
       kernel.outbox_events,kernel.idempotency_records restart identity cascade`,
    );
  });

  afterAll(() => app.database.close());

  it("performs a real exact-price funding, wallet checkout, entitlement, and YAML-backed persisted distribution", async () => {
    const seller = await app.authentication.register({
      email: "distribution-seller@example.test",
      username: "dist_seller",
      password: "integration-test-password",
      country: "NG",
    });
    const buyer = await app.authentication.register({
      email: "distribution-buyer@example.test",
      username: "dist_buyer",
      password: "integration-test-password",
      country: "NG",
    });
    const parent = await app.authentication.register({
      email: "distribution-parent@example.test",
      username: "dist_parent",
      password: "integration-test-password",
      country: "NG",
    });
    await app.referralGraphService.establish(buyer.id, parent.id);
    const listing = await app.listingService.createPublished(seller, {
      title: "Distribution scenario integration item",
      shortDescription: "Real persisted flow",
      longDescription: "Exercises the development distribution scenario.",
      priceMinor: "1400",
      currency: "USD",
      destination: "https://example.test/distribution-scenario",
    });

    vi.stubEnv("NODE_ENV", "development");
    try {
      const report = await new DevelopmentDistributionScenario(app).run({
        buyerUsername: "dist_buyer",
        listingId: listing.id,
      });
      expect(report.buyer).toEqual({ username: "dist_buyer", id: buyer.id });
      expect(report.listing).toMatchObject({ id: listing.id, price: "$14.00" });
      expect(report.wallet).toMatchObject({
        before: "$0.00",
        funded: "+$14.00",
        purchase: "-$14.00",
        after: "$0.00",
        netChange: "$0.00",
      });

      const funding = await app.funding.findById(report.fundingId);
      expect(funding).toMatchObject({
        state: "confirmed",
        accountId: buyer.id,
        providerName: "development",
      });
      expect(funding?.canonicalAmount.minorAmount).toBe(1400n);
      expect((await app.checkoutRepository.findById(report.checkoutId))?.state).toBe("paid");
      const purchase = await app.purchases.findById(report.purchaseId);
      expect(purchase).toMatchObject({ state: "paid", checkoutId: report.checkoutId });
      expect(await app.entitlements.findByPurchaseId(report.purchaseId)).not.toBeNull();

      const distribution = await app.ledger.findDistributionByPurchaseId(report.purchaseId);
      const entries = await app.ledger.findEntriesByPurchaseId(report.purchaseId);
      expect(distribution?.id).toBe(report.distributionId);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((entry) => entry.distributionId === report.distributionId)).toBe(true);
      expect(report.entries.some((entry) => entry.username === "dist_seller")).toBe(true);
      expect(
        report.entries.some(
          (entry) => entry.username === "dist_parent" && entry.label === "Level 1",
        ),
      ).toBe(true);
      expect(entries.reduce((sum, entry) => sum + entry.amount.minorAmount, 0n)).toBe(1400n);

      const repeated = await app.purchaseDistribution.process({
        purchaseId: report.purchaseId,
        correlationId: newId(),
      });
      expect(repeated.id).toBe(distribution?.id);
      expect(
        (await app.ledger.findEntriesByPurchaseId(report.purchaseId)).map((entry) => entry.id),
      ).toEqual(entries.map((entry) => entry.id));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
