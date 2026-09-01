import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type { PaymentProvider, PaymentVerification } from "@/modules/payment/payment";
import { FundingInitializationProcessor } from "@/application/wallet-commerce";
import { Entitlement } from "@/modules/entitlement/entitlement";
import { PurchaseDistributionProcessor } from "@/processors/purchase-distribution";
import { CommissionPolicy } from "@/modules/referral/commission";
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("wallet-first durable commerce", () => {
  const app = createContainer(url!);
  beforeEach(async () => {
    await app.database.query(
      `truncate table wallet_capability.debits,wallet_capability.credits,checkout_capability.checkouts,funding_capability.funding_transactions,ledger_capability.entries,ledger_capability.purchase_distributions,access_capability.access_grants,entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`,
    );
  });
  afterAll(() => app.database.close());
  async function setup() {
    const seller = await app.authentication.register({
      email: "wallet.seller@example.com",
      handle: "walletseller",
      password: "correct-horse-battery",
    });
    const buyer = await app.authentication.register({
      email: "wallet.buyer@example.com",
      handle: "walletbuyer",
      password: "correct-horse-staple",
      country: "NG",
    });
    const listing = await app.listingService.createPublished(seller, {
      title: "Wallet item",
      description: "",
      priceMinor: "1000",
      currency: "USD",
      destination: "https://destination.example/item",
    });
    return { seller, buyer, listing };
  }
  it("keeps funding confirmation, wallet credit, availability, checkout, entitlement and distribution as independent durable phases", async () => {
    const { seller, buyer, listing } = await setup();
    const checkout = await app.walletCheckout.initiate({
      buyerId: buyer.id,
      listingId: listing.id,
      idempotencyKey: "buy-1",
    });
    expect(checkout.state).toBe("awaiting_funds");
    const checkoutRetryBeforeFunding = await app.walletCheckout.initiate({
      buyerId: buyer.id,
      listingId: listing.id,
      idempotencyKey: "buy-1",
    });
    expect(checkoutRetryBeforeFunding.id).toBe(checkout.id);
    expect((await app.wallet.summary(buyer.id)).available.minorAmount).toBe(0n);
    const funding = await app.fundingService.create({
      accountId: buyer.id,
      amountMinor: 1000n,
      providerName: "development",
      idempotencyKey: "fund-1",
    });
    await app.fundingInitialization.process(funding.id);
    const confirmed = await app.fundingVerification.process(funding.id);
    expect(confirmed?.state).toBe("confirmed");
    expect((await app.wallet.summary(buyer.id)).available.minorAmount).toBe(0n);
    expect(await app.entitlements.findByPurchaseId(checkout.purchaseId)).toBeNull();
    await app.walletCredit.process(funding.id);
    expect((await app.wallet.summary(buyer.id)).pending.minorAmount).toBe(1000n);
    expect((await app.wallet.summary(buyer.id)).available.minorAmount).toBe(0n);
    await app.walletAvailability.runBatch();
    expect((await app.wallet.summary(buyer.id)).available.minorAmount).toBe(1000n);
    const checkoutRetryAfterFunding = await app.walletCheckout.initiate({
      buyerId: buyer.id,
      listingId: listing.id,
      idempotencyKey: "buy-1",
    });
    expect(checkoutRetryAfterFunding.id).toBe(checkout.id);
    expect((await app.checkoutRepository.findById(checkout.id))?.state).toBe("awaiting_funds");
    await app.checkoutPayment.process(checkout.id);
    expect((await app.checkoutRepository.findById(checkout.id))?.state).toBe("paid");
    expect((await app.wallet.summary(buyer.id)).available.minorAmount).toBe(0n);
    expect((await app.purchases.findById(checkout.purchaseId))?.state).toBe("paid");
    expect(await app.entitlements.findByPurchaseId(checkout.purchaseId)).toBeNull();
    expect(
      (await app.accountProjections.purchase(buyer.id, checkout.purchaseId)).access_available,
    ).toBe(false);
    const entitlement = await app.entitlementIssuance.process(checkout.purchaseId);
    expect(entitlement?.isActive).toBe(true);
    expect(
      (await app.accountProjections.purchase(buyer.id, checkout.purchaseId)).access_available,
    ).toBe(true);
    expect(await app.ledger.findDistributionByPurchaseId(checkout.purchaseId)).toBeNull();
    const destination = await app.buyerAccess.handoffPurchase(
      buyer,
      checkout.purchaseId,
      "wallet-access",
    );
    const source = destination.searchParams.get("source")!;
    const integration = await app.integrations.create(seller.id, "wallet destination", listing.id);
    const principal = await app.integrations.authenticate(integration.credential);
    expect(await app.access.verify(source, principal!)).toMatchObject({
      authorized: true,
      buyerId: buyer.id,
      listingId: listing.id,
    });
    await app.database.query(
      `update entitlement_capability.entitlements set expires_at=now()-interval '1 second' where purchase_id=$1`,
      [checkout.purchaseId],
    );
    expect(
      (await app.accountProjections.purchase(buyer.id, checkout.purchaseId)).access_available,
    ).toBe(false);
    await app.database.query(
      `update entitlement_capability.entitlements set state='revoked',expires_at=null where purchase_id=$1`,
      [checkout.purchaseId],
    );
    expect(
      (await app.accountProjections.purchase(buyer.id, checkout.purchaseId)).access_available,
    ).toBe(false);
    await app.purchaseDistribution.process({
      purchaseId: checkout.purchaseId,
      correlationId: newId(),
    });
    expect(
      (await app.ledger.findDistributionByPurchaseId(checkout.purchaseId))?.gross.currency,
    ).toBe("USD");
    await Promise.all([
      app.checkoutPayment.process(checkout.id),
      app.checkoutPayment.process(checkout.id),
      app.entitlementIssuance.process(checkout.purchaseId),
      app.entitlementIssuance.process(checkout.purchaseId),
    ]);
    expect(
      (
        await app.database.query(`select 1 from wallet_capability.debits where checkout_id=$1`, [
          checkout.id,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await app.database.query(
          `select 1 from entitlement_capability.entitlements where purchase_id=$1`,
          [checkout.purchaseId],
        )
      ).rowCount,
    ).toBe(1);
  });
  it("applies the configured YAML commission depth and retains missing-upline/residual cents in the platform remainder", async () => {
    const { seller, buyer } = await setup();
    const parent = await app.authentication.register({
      email: `policy-parent-${newId()}@example.com`,
      handle: `pp${newId().slice(0, 8)}`,
      password: "correct-horse-battery",
    });
    const promoter = await app.authentication.register({
      email: `policy-promoter-${newId()}@example.com`,
      handle: `pr${newId().slice(0, 8)}`,
      password: "correct-horse-battery",
    });
    await app.referralGraphService.establish(promoter.id, parent.id);
    const listing = await app.listingService.createPublished(seller, {
      title: "Policy item",
      description: "",
      priceMinor: "10000",
      currency: "USD",
      destination: "https://destination.example/policy",
    });
    const link = await app.referralAttribution.createLink(promoter.id, listing.id);
    const visit = await app.referralAttribution.visit(link.code);
    const checkout = await app.walletCheckout.initiate({
      buyerId: buyer.id,
      listingId: listing.id,
      idempotencyKey: "policy-buy",
      attributionSource: visit!.source,
    });
    const funding = await app.fundingService.create({
      accountId: buyer.id,
      amountMinor: 10000n,
      providerName: "development",
      idempotencyKey: "policy-fund",
    });
    await app.fundingInitialization.process(funding.id);
    await app.fundingVerification.process(funding.id);
    await app.walletCredit.process(funding.id);
    await app.walletAvailability.runBatch();
    await app.checkoutPayment.process(checkout.id);
    const yamlPolicy = { getActive: async () => new CommissionPolicy([20, 10, 5], "percentage") };
    const processor = new PurchaseDistributionProcessor(
      app.purchases,
      app.commissionDistribution,
      app.commissionPolicy,
      app.financialDistributionPolicy,
      app.ledger,
      app.outbox,
      app.database,
      yamlPolicy,
    );
    const distribution = await processor.process({
      purchaseId: checkout.purchaseId,
      correlationId: newId(),
    });
    const entries = await app.ledger.findEntriesByPurchaseId(checkout.purchaseId);
    expect(entries.map((entry) => [entry.recipientRole, entry.amount.minorAmount]).sort()).toEqual(
      [
        ["referral", 1000n],
        ["referral", 2000n],
      ].sort(),
    );
    expect(
      entries.reduce((sum, entry) => sum + entry.amount.minorAmount, 0n) +
        distribution.platformAmountMinor!,
    ).toBe(10000n);
    expect(distribution.platformAmountMinor).toBe(7000n);
    expect(distribution.policySnapshot).toMatchObject({
      allocatedPercentage: 35,
      platformRemainderMinor: "7000",
      levels: [
        { level: 1, percentage: 20, recipient: promoter.id, amountMinor: "2000" },
        { level: 2, percentage: 10, recipient: parent.id, amountMinor: "1000" },
        { level: 3, percentage: 5, recipient: null, amountMinor: "0" },
      ],
    });
  });
  it("denies expired entitlements without depending on an expiry worker", async () => {
    const e = new (await import("@/modules/entitlement/entitlement")).Entitlement(
      newId(),
      newId(),
      newId(),
      newId(),
      new Date(Date.now() - 1000),
    );
    expect(e.isActive).toBe(false);
  });

  it.each([
    [
      "correct",
      (reference: string, amount: Money): PaymentVerification => ({
        verified: true,
        status: "success",
        reference,
        amount,
      }),
      "confirmed",
    ],
    [
      "unsuccessful",
      (reference: string, amount: Money): PaymentVerification => ({
        verified: false,
        status: "failed",
        reference,
        amount,
      }),
      "failed",
    ],
    [
      "wrong reference",
      (_reference: string, amount: Money): PaymentVerification => ({
        verified: true,
        status: "success",
        reference: "wrong-reference",
        amount,
      }),
      "failed",
    ],
    [
      "wrong amount",
      (reference: string, amount: Money): PaymentVerification => ({
        verified: true,
        status: "success",
        reference,
        amount: Money.of(amount.minorAmount + 1n, amount.currency),
      }),
      "failed",
    ],
    [
      "wrong currency",
      (reference: string, amount: Money): PaymentVerification => ({
        verified: true,
        status: "success",
        reference,
        amount: Money.of(amount.minorAmount, "NGN"),
      }),
      "failed",
    ],
  ])(
    "enforces the persisted funding facts for %s verification",
    async (label, verification, expectedState) => {
      const { buyer } = await setup();
      const name = `verify-${label.replaceAll(" ", "-")}`;
      const provider: PaymentProvider = {
        name,
        collectionCurrencies: ["USD"],
        referenceFor: ({ paymentId }) => `ref-${paymentId}`,
        initiate: async (input) => ({ reference: `ref-${input.paymentId}` }),
        verify: async (input) => verification(input.reference, input.expectedAmount),
      };
      app.providers.register(provider);
      const funding = await app.fundingService.create({
        accountId: buyer.id,
        amountMinor: 1000n,
        providerName: name,
        idempotencyKey: `fund-${label}`,
      });
      await app.fundingInitialization.process(funding.id);
      const result = await app.fundingVerification.process(funding.id);
      expect(result?.state).toBe(expectedState);
      const operation = (
        await app.database.query<any>(
          `select outcome,provider_code from payment_capability.provider_operations where funding_id=$1 and operation='transaction.verify' order by occurred_at desc limit 1`,
          [funding.id],
        )
      ).rows[0];
      expect(operation.outcome).toBe(expectedState === "confirmed" ? "succeeded" : "failed");
      if (expectedState === "failed") {
        expect(await app.walletCredit.process(funding.id)).toBeNull();
        expect(await app.walletRepository.findCreditByFunding(funding.id)).toBeNull();
      }
    },
  );

  it("recovers one stale initializing claim without changing funding identity", async () => {
    const { buyer } = await setup();
    let calls = 0;
    const provider: PaymentProvider = {
      name: "stale-development",
      collectionCurrencies: ["USD"],
      referenceFor: ({ paymentId }) => `stable-${paymentId}`,
      initiate: async (input) => {
        calls++;
        return {
          reference: `stable-${input.paymentId}`,
          authorizationUrl: "https://provider.example/authorize",
        };
      },
      verify: async (input) => ({
        verified: true,
        status: "success",
        reference: input.reference,
        amount: input.expectedAmount,
      }),
    };
    app.providers.register(provider);
    const funding = await app.fundingService.create({
      accountId: buyer.id,
      amountMinor: 1000n,
      providerName: provider.name,
      idempotencyKey: "stale-funding",
    });
    const workerAClaimedAt = new Date("2026-01-01T00:00:00.000Z");
    const claimed = await app.database.transaction(() =>
      app.funding.claimInitialization(
        funding.id,
        new Date("2025-12-31T23:55:00.000Z"),
        workerAClaimedAt,
      ),
    );
    expect(claimed?.state).toBe("initializing");
    const beforeStale = new FundingInitializationProcessor(
      app.funding,
      app.providers,
      app.accounts,
      app.database,
      app.paymentOperations,
      300_000,
      () => new Date("2026-01-01T00:04:59.000Z"),
    );
    expect(await beforeStale.findWork()).toHaveLength(0);
    const workerB = new FundingInitializationProcessor(
      app.funding,
      app.providers,
      app.accounts,
      app.database,
      app.paymentOperations,
      300_000,
      () => new Date("2026-01-01T00:05:01.000Z"),
    );
    expect((await workerB.findWork()).map((value) => value.id)).toContain(funding.id);
    const results = await Promise.all([workerB.process(funding.id), workerB.process(funding.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const recovered = await app.funding.findById(funding.id);
    expect(recovered).toMatchObject({
      id: funding.id,
      providerReference: funding.providerReference,
      idempotencyKey: funding.idempotencyKey,
      state: "awaiting_payment",
    });
    expect(calls).toBe(1);
    expect(
      (
        await app.database.query(
          `select id from funding_capability.funding_transactions where id=$1`,
          [funding.id],
        )
      ).rowCount,
    ).toBe(1);
  });

  it("filters expired active entitlements in PostgreSQL before access issuance", async () => {
    const { buyer, listing } = await setup();
    const checkout = await app.walletCheckout.initiate({
      buyerId: buyer.id,
      listingId: listing.id,
      idempotencyKey: "expired-access",
    });
    const expired = Entitlement.restore(
      newId(),
      buyer.id,
      listing.id,
      checkout.purchaseId,
      "active",
      new Date(Date.now() - 60_000),
    );
    await app.entitlements.save(expired);
    expect(await app.entitlements.findActive(buyer.id, listing.id)).toBeNull();
    const before = (
      await app.database.query(
        `select id from access_capability.access_grants where entitlement_id=$1`,
        [expired.id],
      )
    ).rowCount;
    await expect(app.access.issue(buyer.id, listing.id)).rejects.toThrow(
      "Active entitlement not found",
    );
    const after = (
      await app.database.query(
        `select id from access_capability.access_grants where entitlement_id=$1`,
        [expired.id],
      )
    ).rowCount;
    expect(after).toBe(before);
  });
});
