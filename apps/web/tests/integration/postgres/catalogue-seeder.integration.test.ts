import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import {
  CatalogueListingSeeder,
  FREE_CATALOGUE_LISTINGS,
} from "@/infrastructure/postgres/seed/catalogue-listings";
import { CommercialWorkflowDispatcher } from "@/workers/commercial/dispatcher";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("development free catalogue seeder", () => {
  const app = createContainer(url!);

  beforeEach(async () => {
    await app.database.query("truncate table listing_capability.listings cascade");
    await app.database.query("truncate table identity_capability.accounts cascade");
  });

  afterAll(() => app.database.close());

  it("seeds published free listings idempotently and exposes them in the public catalogue", async () => {
    const seller = await app.authentication.register({
      email: "catalogue-seed@example.test",
      username: "catalogueseed",
      password: "correct-horse-battery",
      country: "NG",
    });
    const paid = await app.listingService.createPublished(seller, {
      title: "Paid catalogue fixture",
      shortDescription: "A paid listing remains supported.",
      longDescription: "A paid resource for the seed regression.",
      priceMinor: "1200",
      currency: "USD",
      destination: "https://example.test/catalogue/paid-fixture",
      externalKey: "paid-seed-regression",
    });
    const seeder = new CatalogueListingSeeder(app.listingService);

    await seeder.seedFree(seller);
    await seeder.seedFree(seller);

    const publicCatalogue = await app.listingService.queryPublic({ limit: 100 });
    const freeListings = publicCatalogue.items.filter((listing) =>
      FREE_CATALOGUE_LISTINGS.some((fixture) => fixture.externalKey === listing.externalKey),
    );
    expect(freeListings).toHaveLength(2);
    expect(
      freeListings
        .map((listing) => [listing.externalKey, listing.title])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ).toEqual(
      FREE_CATALOGUE_LISTINGS.map(({ externalKey, title }) => [externalKey, title]).sort(
        ([left], [right]) => left.localeCompare(right),
      ),
    );
    for (const listing of freeListings) {
      expect(listing.state).toBe("published");
      expect(listing.price.minorAmount).toBe(0n);
      expect(listing.price.currency).toBe("USD");
      expect(new URL(listing.destination).protocol).toMatch(/^https?:$/);
    }
    expect(publicCatalogue.items.find((listing) => listing.id === paid.id)?.price.minorAmount).toBe(
      1200n,
    );

    const counts = await app.database.query<{ relation: string; count: string }>(
      `select 'checkouts' relation,count(*)::text count from checkout_capability.checkouts
       union all select 'purchases',count(*)::text from purchase_capability.purchases
       union all select 'debits',count(*)::text from wallet_capability.debits
       union all select 'payments',count(*)::text from payment_capability.payments
       union all select 'funding',count(*)::text from funding_capability.funding_transactions
       union all select 'entitlements',count(*)::text from entitlement_capability.entitlements
       union all select 'distributions',count(*)::text from ledger_capability.purchase_distributions`,
    );
    expect(
      Object.fromEntries(counts.rows.map(({ relation, count }) => [relation, Number(count)])),
    ).toEqual({
      checkouts: 0,
      purchases: 0,
      debits: 0,
      payments: 0,
      funding: 0,
      entitlements: 0,
      distributions: 0,
    });

    const buyer = await app.authentication.register({
      email: "catalogue-free-buyer@example.test",
      username: "cataloguefreebuyer",
      password: "correct-horse-battery",
      country: "NG",
    });
    const selectedFreeListing = freeListings[0]!;
    const checkout = await app.walletCheckout.initiate({
      buyerId: buyer.id,
      listingId: selectedFreeListing.id,
      idempotencyKey: "catalogue-seed-free-acquisition",
    });
    expect(checkout.amount.minorAmount).toBe(0n);
    expect((await app.purchases.findById(checkout.purchaseId))?.terms.price).toEqual({
      minorAmount: "0",
      currency: "USD",
    });
    const acquisition = await app.walletCheckoutPayment.pay({
      buyerId: buyer.id,
      checkoutId: checkout.id,
    });
    expect(acquisition.checkout.state).toBe("paid");
    expect((await app.wallet.summary(buyer.id)).available.minorAmount).toBe(0n);
    expect(
      (await app.accountProjections.purchase(buyer.id, checkout.purchaseId)).access_available,
    ).toBe(false);

    await new CommercialWorkflowDispatcher(app, { error: () => {} }).runOnce();
    expect((await app.entitlements.findByPurchaseId(checkout.purchaseId))?.isActive).toBe(true);
    expect(
      (await app.accountProjections.purchase(buyer.id, checkout.purchaseId)).access_available,
    ).toBe(true);
    const handoff = await app.buyerAccess.handoffPurchase(buyer, checkout.purchaseId);
    const integration = await app.integrations.create(
      seller.id,
      "seeded free listing access",
      selectedFreeListing.id,
    );
    const principal = await app.integrations.authenticate(integration.credential);
    expect(await app.access.verify(handoff.searchParams.get("source")!, principal!)).toMatchObject({
      authorized: true,
      buyerId: buyer.id,
      listingId: selectedFreeListing.id,
    });

    const acquisitionCounts = await app.database.query<{
      checkouts: string;
      purchases: string;
      entitlements: string;
      debits: string;
      payments: string;
      funding: string;
    }>(
      `select
        (select count(*) from checkout_capability.checkouts where uuid=$1)::text checkouts,
        (select count(*) from purchase_capability.purchases where uuid=$2)::text purchases,
        (select count(*) from entitlement_capability.entitlements where purchase_id=(select id from purchase_capability.purchases where uuid=$2))::text entitlements,
        (select count(*) from wallet_capability.debits where checkout_id=(select id from checkout_capability.checkouts where uuid=$1))::text debits,
        (select count(*) from payment_capability.payments where buyer_id=(select id from identity_capability.accounts where uuid=$3))::text payments,
        (select count(*) from funding_capability.funding_transactions where account_id=(select id from identity_capability.accounts where uuid=$3))::text funding`,
      [checkout.id, checkout.purchaseId, buyer.id],
    );
    expect(acquisitionCounts.rows[0]).toEqual({
      checkouts: "1",
      purchases: "1",
      entitlements: "1",
      debits: "0",
      payments: "0",
      funding: "0",
    });
  });
});
