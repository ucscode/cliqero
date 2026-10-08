import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import {
  AuditedFactHandler,
  PurchaseCompletedDistributionHandler,
} from "@/workers/outbox/handlers";
import { PurchaseDistributionProcessor } from "@/processors/purchase/distribution";
import { OutboxDispatcher, OutboxHandlerRegistry } from "@/workers/outbox/dispatcher";
import { OperatorBulkWorkflow } from "@/application/operator/bulk-workflow";
import { PostgresFundingReversalRepository } from "@/infrastructure/postgres/funding/reversals";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("purchase financial distribution", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(async () => {
    await app.database
      .query(`truncate table treasury_capability.entries,ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.reversals,ledger_capability.purchase_distributions,
    payment_capability.reconciliation_attempts,payment_capability.provider_events,referral_capability.listing_attributions,
    referral_capability.account_referrals,access_capability.access_grants,
    entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,
    identity_capability.account_capabilities,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`);
    await app.database.query(
      `update ledger_capability.distribution_policy set platform_rate_basis_points=1000,remainder_recipient='seller',initial_balance_state='available',settlement_delay_seconds=0`,
    );
    await app.database.query(
      `update referral_capability.commission_policy set rates_basis_points='{500,250}'`,
    );
  });
  afterAll(() => app.database.close());
  async function account(label: string) {
    return app.authentication.register({
      email: `${label}@example.com`,
      username: label,
      password: "correct-horse-battery",
      country: "NG",
    });
  }
  async function grantFinanceRead(...accountIds: string[]) {
    for (const accountId of accountIds)
      await app.database.query(
        `insert into identity_capability.account_capabilities(account_id,capability)
         values((select id from identity_capability.accounts where uuid=$1),'finance.read')
         on conflict do nothing`,
        [accountId],
      );
  }
  async function completed(attributionSource?: string, referrerId?: string, priceMinor = "101") {
    const seller = await account(`seller${newId().slice(0, 5)}`),
      buyer = await account(`buyer${newId().slice(0, 5)}`);
    const listing = await app.listingService.create(seller, {
      state: "published",
      title: "Auditable",
      shortDescription: "Auditable purchase",
      longDescription: "Detailed auditable listing.",
      priceMinor,
      currency: "USD",
      destination: "https://example.test/access",
    });
    if (referrerId) await app.referralGraphService.establish(buyer.id, referrerId);
    const referralSource = referrerId
      ? (await app.referralAttribution.visit(referrerId, listing.id))?.source
      : undefined;
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: newId(),
      attributionSource: referralSource ?? attributionSource,
    });
    await app.legacyPaymentCompletion.complete({
      paymentId: checkout.paymentId,
      correlationId: newId(),
    });
    return { seller, buyer, listing, purchaseId: checkout.purchaseId!, referrerId };
  }

  it("settles outstanding debt before positive earnings adjustments become available", async () => {
    const owner = await account(`debtadj${newId().replaceAll("-", "").slice(0, 8)}`);
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'finance.manage'),
             ((select id from identity_capability.accounts where uuid=$1),'finance.read')`,
      [owner.id],
    );
    await app.accountDebt.increase({
      accountId: owner.id,
      amountMinor: 6_000n,
      wallet: "account",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Known outstanding recovery fixture",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: `earnings-adjustment-debt:${newId()}`,
    });

    const adjustment = await app.earningsAdjustments.create(owner.id, {
      accountId: owner.id,
      amountMinor: "10000",
      reason: "Corrective positive earning",
      reference: newId(),
      idempotencyKey: newId(),
    });

    expect(adjustment.created).toBe(true);
    expect(await app.accountDebt.balance(owner.id, owner.id)).toBe("0");
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(4_000n);
    const settlements = await app.database.query<{ amount_minor: string; source_id: string }>(
      `select amount_minor,source_id from ledger_capability.account_debt_entries
        where account_id=(select id from identity_capability.accounts where uuid=$1)
          and kind='settlement' and source_kind='earnings_adjustment'`,
      [owner.id],
    );
    expect(settlements.rows).toEqual([
      { amount_minor: "6000", source_id: adjustment.adjustment.id },
    ]);
  });

  it("serializes concurrent adjustment retries and settles debt only once", async () => {
    const owner = await account(`adjretry${newId().replaceAll("-", "").slice(0, 8)}`);
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'finance.manage'),
             ((select id from identity_capability.accounts where uuid=$1),'finance.read')`,
      [owner.id],
    );
    await app.accountDebt.increase({
      accountId: owner.id,
      amountMinor: 250n,
      wallet: "earnings",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Adjustment retry debt",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: `adjustment-debt:${newId()}`,
    });
    const key = newId();
    const intent = {
      accountId: owner.id,
      amountMinor: "1000",
      reason: "  Corrected earning  ",
      reference: " REF-1 ",
      idempotencyKey: key,
    };
    const results = await Promise.all([
      app.earningsAdjustments.create(owner.id, intent),
      app.earningsAdjustments.create(owner.id, {
        ...intent,
        amountMinor: "01000",
        reason: "Corrected earning",
        reference: "REF-1",
      }),
    ]);
    expect(results.map((result) => result.adjustment.id)).toEqual([
      results[0].adjustment.id,
      results[0].adjustment.id,
    ]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await app.accountDebt.balance(owner.id, owner.id)).toBe("0");
    expect(
      (
        await app.database.query(
          `select count(*)::int count from ledger_capability.earnings_adjustments where idempotency_key=$1`,
          [key],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await app.database.query(
          `select count(*)::int count from ledger_capability.account_debt_entries
        where account_id=(select id from identity_capability.accounts where uuid=$1) and kind='settlement' and source_kind='earnings_adjustment'`,
          [owner.id],
        )
      ).rows[0].count,
    ).toBe(1);
    await expect(
      app.earningsAdjustments.create(owner.id, { ...intent, amountMinor: "1001" }),
    ).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
    const other = await account(`adjother${newId().replaceAll("-", "").slice(0, 8)}`);
    await expect(
      app.earningsAdjustments.create(owner.id, { ...intent, accountId: other.id }),
    ).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
    await expect(
      app.earningsAdjustments.create(owner.id, { ...intent, reason: "Different reason" }),
    ).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
    await expect(
      app.earningsAdjustments.create(owner.id, { ...intent, reference: "Different reference" }),
    ).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
  });

  it("conserves organic gross and distributes exactly once under duplicate/concurrent delivery", async () => {
    const value = await completed();
    const correlationId = newId();
    const results = await Promise.all([
      app.purchaseDistribution.process({ purchaseId: value.purchaseId, correlationId }),
      app.purchaseDistribution.process({ purchaseId: value.purchaseId, correlationId }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    const entries = await app.ledger.findEntriesByPurchaseId(value.purchaseId);
    expect(entries.map((e) => [e.recipientRole, e.amount.minorAmount]).sort()).toEqual(
      [
        ["seller", 84n],
        ["platform", 17n],
      ].sort(),
    );
    expect(entries.reduce((sum, e) => sum + e.amount.minorAmount, 0n)).toBe(101n);
    expect(
      (
        await app.database.query(
          `select 1 from kernel.outbox_events where event_name='purchase.distribution.completed'`,
        )
      ).rowCount,
    ).toBe(1);
  });

  it("creates one source-linked treasury credit for a completed distribution", async () => {
    const value = await completed();
    const distribution = await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    const platformAmountMinor = distribution.platformAmountMinor ?? 0n;
    const results = await Promise.all([
      app.treasuryProcessor.process(distribution.id),
      app.treasuryProcessor.process(distribution.id),
    ]);
    expect(results[0]?.id).toBe(results[1]?.id);
    const rows = (
      await app.database.query<any>(
        `select source_kind,source_id,amount_minor from treasury_capability.entries where source_kind='distribution' and source_id=$1`,
        [distribution.id],
      )
    ).rows;
    expect(rows).toHaveLength(platformAmountMinor > 0n ? 1 : 0);
    if (rows[0]) expect(BigInt(rows[0].amount_minor)).toBe(platformAmountMinor);
  });

  it("root bulk deletion removes a distribution, its generated ledger facts, and its Treasury projection", async () => {
    const value = await completed();
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [value.seller.id],
    );
    const distribution = await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    await app.treasuryProcessor.process(distribution.id);
    const before = await app.treasuryRepository.summary();
    expect(before.balanceMinor).toBeGreaterThan(0n);

    const outcome = await new OperatorBulkWorkflow(app).execute(value.seller, {
      resource: "distributions",
      action: "delete",
      ids: [distribution.id],
    });

    expect(outcome).toEqual({ succeeded: [distribution.id], failed: [] });
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(0n);
    expect(
      await app.database.query(
        `select 1 from ledger_capability.purchase_distributions where uuid=$1
         union all select 1 from ledger_capability.entries where distribution_id=(select id from ledger_capability.purchase_distributions where uuid=$1)
         union all select 1 from treasury_capability.entries where source_kind='distribution' and source_id=$1`,
        [distribution.id],
      ),
    ).toMatchObject({ rows: [] });
    expect(
      await app.database.query(
        `select count(*)::int count from kernel.audit_records
          where action='root.delete' and subject_type='distribution' and subject_id=$1`,
        [distribution.id],
      ),
    ).toMatchObject({ rows: [{ count: 1 }] });
  });

  it("system.root bulk deletion removes an earnings adjustment and preserves its audit snapshot", async () => {
    const value = await completed();
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [value.seller.id],
    );
    const adjustment = await app.earningsAdjustments.create(value.seller.id, {
      accountId: value.seller.id,
      amountMinor: "425",
      reason: "Root-delete integration fixture",
      reference: newId(),
      idempotencyKey: newId(),
    });

    const outcome = await new OperatorBulkWorkflow(app).execute(value.seller, {
      resource: "earnings-adjustments",
      action: "delete",
      ids: [adjustment.adjustment.id],
    });

    expect(outcome).toEqual({ succeeded: [adjustment.adjustment.id], failed: [] });
    expect(
      await app.database.query(
        "select 1 from ledger_capability.earnings_adjustments where uuid=$1",
        [adjustment.adjustment.id],
      ),
    ).toMatchObject({ rows: [] });
    expect(
      await app.database.query(
        `select previous_state->>'reason' reason from kernel.audit_records
          where action='root.delete' and subject_type='earnings_adjustment' and subject_id=$1`,
        [adjustment.adjustment.id],
      ),
    ).toMatchObject({ rows: [{ reason: adjustment.adjustment.reason }] });
  });

  it("system.root bulk deletion removes a generated earning and updates the ledger projection", async () => {
    const seller = await account(`esell${newId().slice(0, 5)}`);
    const buyer = await account(`ebuy${newId().slice(0, 5)}`);
    const referrer = await account(`eref${newId().slice(0, 5)}`);
    await app.referralGraphService.establish(buyer.id, referrer.id);
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [seller.id],
    );
    const listing = await app.listingService.create(seller, {
      state: "published",
      title: "Earning delete fixture",
      shortDescription: "Referral earning",
      longDescription: "A real completed referral-backed purchase.",
      priceMinor: "10000",
      currency: "USD",
      destination: "https://example.test/earning-delete",
    });
    const visit = await app.referralAttribution.visit(referrer.id, listing.id);
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: newId(),
      attributionSource: visit!.source,
    });
    await app.legacyPaymentCompletion.complete({
      paymentId: checkout.paymentId,
      correlationId: newId(),
    });
    const distribution = await app.purchaseDistribution.process({
      purchaseId: checkout.purchaseId!,
      correlationId: newId(),
    });
    const earning = (
      await app.database.query<{ uuid: string }>(
        `select uuid from ledger_capability.entries
          where distribution_id=(select id from ledger_capability.purchase_distributions where uuid=$1)
            and recipient_role='referral' and direction='credit' limit 1`,
        [distribution.id],
      )
    ).rows[0]!;

    const outcome = await new OperatorBulkWorkflow(app).execute(seller, {
      resource: "earnings",
      action: "delete",
      ids: [earning.uuid],
    });

    expect(outcome).toEqual({ succeeded: [earning.uuid], failed: [] });
    expect(
      await app.database.query("select 1 from ledger_capability.entries where uuid=$1", [
        earning.uuid,
      ]),
    ).toMatchObject({ rows: [] });
    expect(
      await app.database.query(
        `select 1 from kernel.audit_records
          where action='root.delete' and subject_type='earning' and subject_id=$1`,
        [earning.uuid],
      ),
    ).toMatchObject({ rowCount: 1 });
  });

  it("uses trusted attribution and bounded exact referral commission facts", async () => {
    const grandparent = await account(`grand${newId().slice(0, 5)}`),
      parent = await account(`parent${newId().slice(0, 5)}`),
      promoter = await account(`promo${newId().slice(0, 5)}`);
    await app.referralGraphService.establish(parent.id, grandparent.id);
    const seller = await account(`sell${newId().slice(0, 5)}`),
      buyer = await account(`buy${newId().slice(0, 5)}`);
    await app.referralGraphService.establish(buyer.id, parent.id);
    const listing = await app.listingService.create(seller, {
      state: "published",
      title: "Referral",
      shortDescription: "Referral purchase",
      longDescription: "Detailed referral listing.",
      priceMinor: "10000",
      currency: "USD",
      destination: "https://example.test",
    });
    const visit = await app.referralAttribution.visit(promoter.id, listing.id);
    expect(visit).not.toBeNull();
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: newId(),
      attributionSource: visit!.source,
    });
    await app.legacyPaymentCompletion.complete({
      paymentId: checkout.paymentId,
      correlationId: newId(),
    });
    const purchase = (await app.purchases.findById(checkout.purchaseId!))!;
    const before = (
      await app.database.query(`select count(*)::int count from ledger_capability.entries`)
    ).rows[0].count;
    const facts = await app.commissionDistribution.calculate(
      purchase,
      await app.commissionPolicy.getActive(),
    );
    expect(
      facts.map((f) => [f.recipientAccountId, f.level, f.calculatedAmount.minorAmount]),
    ).toEqual([
      [parent.id, 1, 500n],
      [grandparent.id, 2, 250n],
    ]);
    expect(
      (await app.database.query(`select count(*)::int count from ledger_capability.entries`))
        .rows[0].count,
    ).toBe(before);
    const dispatcher = new OutboxDispatcher(
      "distribution-test-worker",
      app.outbox,
      new OutboxHandlerRegistry()
        .register(new AuditedFactHandler())
        .register(new PurchaseCompletedDistributionHandler(app.purchaseDistribution)),
      { info: () => undefined, error: () => undefined },
      { pollMilliseconds: 1, staleAfterMilliseconds: 1000 },
    );
    await dispatcher.runOnce();
    const entries = await app.ledger.findEntriesByPurchaseId(purchase.id);
    expect(entries.map((e) => [e.recipientRole, e.amount.minorAmount]).sort()).toEqual(
      [
        ["seller", 8250n],
        ["referral", 500n],
        ["referral", 250n],
        ["platform", 1000n],
      ].sort(),
    );
    expect(
      (
        await app.database.query<{ state: string }>(
          `select state from kernel.outbox_events where event_name='purchase.completed'`,
        )
      ).rows[0].state,
    ).toBe("published");
  });

  it("rolls back every financial consequence and enforces append-only history", async () => {
    const value = await completed();
    const forcedFailure = new PurchaseDistributionProcessor(
      app.purchases,
      app.commissionDistribution,
      app.commissionPolicy,
      app.financialDistributionPolicy,
      app.ledger,
      {
        append: async () => {
          throw new Error("forced outbox failure");
        },
      },
      app.database,
    );
    await expect(
      forcedFailure.process({ purchaseId: value.purchaseId, correlationId: newId() }),
    ).rejects.toThrow("forced outbox failure");
    expect(
      (
        await app.database.query(
          `select 1 from ledger_capability.purchase_distributions where purchase_id=(select id from purchase_capability.purchases where uuid=$1)`,
          [value.purchaseId],
        )
      ).rowCount,
    ).toBe(0);
    await app.database.query(
      `update referral_capability.commission_policy set rates_basis_points='{}'`,
    );
    await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    await expect(
      app.database.query(
        `update ledger_capability.entries set amount_minor=1 where purchase_id=(select id from purchase_capability.purchases where uuid=$1)`,
        [value.purchaseId],
      ),
    ).rejects.toThrow(/append-only/);
    const summary = await app.ledger.summarizeAccount(value.seller.id);
    expect(summary[0].amountMinor).toBe(91n);
    const first = (await app.ledger.findEntriesByPurchaseId(value.purchaseId))[0];
    await expect(
      app.database.query(
        `insert into ledger_capability.entries(uuid,account_id,purchase_id,entry_type,direction,amount_minor,currency,idempotency_key,correlation_id)
       values($1,(select id from identity_capability.accounts where uuid=$2),(select id from purchase_capability.purchases where uuid=$3),'purchase-earnings','credit',1,'USD',$4,$5)`,
        [newId(), value.seller.id, value.purchaseId, first.idempotencyKey, newId()],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("matures pending earnings through an idempotent settlement transition", async () => {
    await app.database.query(
      `update ledger_capability.distribution_policy set initial_balance_state='pending',settlement_delay_seconds=3600`,
    );
    const value = await completed();
    await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    expect((await app.ledger.summarizeAccount(value.seller.id))[0]).toMatchObject({
      balanceState: "pending",
      amountMinor: 84n,
    });
    expect(await app.settlement.settle({ now: new Date() })).toMatchObject({ settled: 0 });
    expect(
      await app.settlement.settle({ now: new Date(Date.now() + 3_601_000), batchSize: 10 }),
    ).toMatchObject({ settled: 2 });
    expect(
      await app.settlement.settle({ now: new Date(Date.now() + 3_601_000), batchSize: 10 }),
    ).toMatchObject({ settled: 0 });
    expect((await app.ledger.summarizeAccount(value.seller.id))[0]).toMatchObject({
      balanceState: "available",
      amountMinor: 84n,
    });
  });

  it("settles debt only when pending seller earnings mature, atomically and idempotently", async () => {
    await app.database.query(
      `update ledger_capability.distribution_policy set initial_balance_state='pending',settlement_delay_seconds=3600`,
    );
    const referrer = await account(`pendingref${newId().slice(0, 5)}`);
    const value = await completed(undefined, referrer.id);
    await grantFinanceRead(value.seller.id, referrer.id);
    await app.accountDebt.increase({
      accountId: value.seller.id,
      amountMinor: 60n,
      wallet: "account",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Debt before pending earning maturity",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: newId(),
    });
    await app.accountDebt.increase({
      accountId: referrer.id,
      amountMinor: 3n,
      wallet: "account",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Referral debt before pending earning maturity",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: newId(),
    });
    await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    const earning = (await app.ledger.findEntriesByPurchaseId(value.purchaseId)).find(
      (entry) => entry.recipientRole === "seller",
    )!;
    expect(earning.balanceState).toBe("pending");
    expect(await app.accountDebt.balance(value.seller.id, value.seller.id)).toBe("60");
    expect(await app.fundsReservation.available(value.seller.id, "USD")).toBe(0n);
    expect(await app.accountDebt.balance(referrer.id, referrer.id)).toBe("3");
    expect(await app.fundsReservation.available(referrer.id, "USD")).toBe(0n);
    await expect(
      app.accountDebt.requireNoOutstanding(value.seller.id, "withdrawal"),
    ).rejects.toMatchObject({
      code: "account_debt_blocks_operation",
    });

    const maturity = new Date(Date.now() + 3_601_000);
    const outcomes = await Promise.all([
      app.settlement.settle({ now: maturity, batchSize: 10 }),
      app.settlement.settle({ now: maturity, batchSize: 10 }),
    ]);
    expect(outcomes.reduce((sum, result) => sum + result.settled, 0)).toBe(3);
    expect(await app.accountDebt.balance(value.seller.id, value.seller.id)).toBe("0");
    expect(await app.fundsReservation.available(value.seller.id, "USD")).toBe(24n);
    expect(await app.accountDebt.balance(referrer.id, referrer.id)).toBe("0");
    expect(await app.fundsReservation.available(referrer.id, "USD")).toBe(2n);
    expect(
      await app.database.query(
        `select 1 from ledger_capability.account_debt_entries where idempotency_key=$1`,
        [`debt-settlement:purchase-earning:${earning.id}`],
      ),
    ).toMatchObject({ rowCount: 1 });
    const referral = (await app.ledger.findEntriesByPurchaseId(value.purchaseId)).find(
      (entry) => entry.recipientRole === "referral",
    )!;
    expect(
      await app.database.query(
        `select 1 from ledger_capability.account_debt_entries where idempotency_key=$1`,
        [`debt-settlement:purchase-earning:${referral.id}`],
      ),
    ).toMatchObject({ rowCount: 1 });
    expect(
      await app.database.query(
        `select 1 from ledger_capability.entry_settlements where original_entry_id=(select id from ledger_capability.entries where uuid=$1)`,
        [earning.id],
      ),
    ).toMatchObject({ rowCount: 1 });
    expect(
      await app.database.query(
        `select 1 from ledger_capability.account_debt_entries debt
          join identity_capability.accounts account on account.id=debt.account_id
          where account.uuid=(select platform_account_uuid from ledger_capability.distribution_policy)
            and debt.kind='settlement' and debt.source_kind='purchase_earning'`,
      ),
    ).toMatchObject({ rowCount: 0 });
    expect(await app.settlement.settle({ now: maturity, batchSize: 10 })).toMatchObject({
      settled: 0,
    });
  });

  it("matures historical pending earnings after policy switches to available", async () => {
    await app.database.query(
      `update ledger_capability.distribution_policy set initial_balance_state='pending',settlement_delay_seconds=3600`,
    );
    const historical = await completed();
    await grantFinanceRead(historical.seller.id);
    await app.accountDebt.increase({
      accountId: historical.seller.id,
      amountMinor: 60n,
      wallet: "account",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Debt before historical pending earning maturity",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: newId(),
    });
    await app.purchaseDistribution.process({
      purchaseId: historical.purchaseId,
      correlationId: newId(),
    });
    const historicalEarning = (
      await app.ledger.findEntriesByPurchaseId(historical.purchaseId)
    ).find((entry) => entry.recipientRole === "seller")!;
    expect(historicalEarning.balanceState).toBe("pending");
    expect(historicalEarning.maturityAt).toBeInstanceOf(Date);
    expect(await app.accountDebt.balance(historical.seller.id, historical.seller.id)).toBe("60");
    expect(await app.fundsReservation.available(historical.seller.id, "USD")).toBe(0n);
    expect(
      await app.database.query(
        `select 1 from ledger_capability.entry_settlements where original_entry_id=(select id from ledger_capability.entries where uuid=$1)`,
        [historicalEarning.id],
      ),
    ).toMatchObject({ rowCount: 0 });

    await app.database.query(
      `update ledger_capability.distribution_policy set initial_balance_state='available'`,
    );
    const current = await completed();
    await app.purchaseDistribution.process({
      purchaseId: current.purchaseId,
      correlationId: newId(),
    });
    const currentEarning = (await app.ledger.findEntriesByPurchaseId(current.purchaseId)).find(
      (entry) => entry.recipientRole === "seller",
    )!;
    expect(currentEarning.balanceState).toBe("available");
    expect(await app.fundsReservation.available(current.seller.id, "USD")).toBe(84n);

    const maturity = new Date(historicalEarning.maturityAt!.getTime() + 1);
    await expect(app.settlement.settle({ now: maturity })).resolves.toMatchObject({
      claimed: 2,
      settled: 2,
    });
    expect(await app.accountDebt.balance(historical.seller.id, historical.seller.id)).toBe("0");
    expect(await app.fundsReservation.available(historical.seller.id, "USD")).toBe(24n);
    expect(
      await app.database.query(
        `select 1 from ledger_capability.entry_settlements where original_entry_id=(select id from ledger_capability.entries where uuid=$1) and from_state='pending' and to_state='available'`,
        [historicalEarning.id],
      ),
    ).toMatchObject({ rowCount: 1 });
    expect(
      await app.database.query(
        `select count(*)::int as count from ledger_capability.account_debt_entries where account_id=(select id from identity_capability.accounts where uuid=$1) and kind='settlement' and source_kind='purchase_earning' and source_id=$2`,
        [historical.seller.id, historicalEarning.id],
      ),
    ).toMatchObject({ rows: [{ count: 1 }] });
    await expect(app.settlement.settle({ now: maturity })).resolves.toMatchObject({
      claimed: 0,
      settled: 0,
    });
  });

  it("keeps matured pending earnings unavailable until debt-first settlement commits", async () => {
    await app.database.query(
      `update ledger_capability.distribution_policy
          set initial_balance_state='pending',settlement_delay_seconds=0,platform_rate_basis_points=0`,
    );
    await app.database.query(
      `update referral_capability.commission_policy set rates_basis_points='{}'`,
    );

    const value = await completed(undefined, undefined, "10000");
    await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    const earning = (await app.ledger.findEntriesByPurchaseId(value.purchaseId)).find(
      (entry) => entry.recipientRole === "seller",
    )!;
    expect(earning).toMatchObject({
      amount: { minorAmount: 10_000n },
      balanceState: "pending",
      recipientRole: "seller",
      purchaseId: value.purchaseId,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(earning.maturityAt!.getTime()).toBeLessThan(Date.now());
    const settlementFactsBefore = await app.database.query<{ count: number }>(
      `select count(*)::int count from ledger_capability.entry_settlements
        where original_entry_id=(select id from ledger_capability.entries where uuid=$1)`,
      [earning.id],
    );
    expect(settlementFactsBefore.rows[0]?.count).toBe(0);

    const reversalRepository = new PostgresFundingReversalRepository(app.database);
    const spendable = async () =>
      BigInt(
        (
          await app.database.query<{ amount: string }>(
            `select ledger_capability.available_earnings_minor(
               (select id from identity_capability.accounts where uuid=$1),'USD')::text amount`,
            [value.seller.id],
          )
        ).rows[0]!.amount,
      );
    expect(await spendable()).toBe(0n);
    expect(await app.fundsReservation.available(value.seller.id, "USD")).toBe(0n);
    expect(await reversalRepository.availableEarnings(value.seller.id)).toBe(0n);

    const destination = await app.withdrawalDestinations.create(value.seller.id, {
      method: "bank_ng",
      name: "Pending earnings test destination",
      values: { bank_name: "Test bank", account_number: "0123456789", account_name: "Seller" },
    });
    await expect(
      app.withdrawals.create({
        accountId: value.seller.id,
        amountMinor: 100n,
        currency: "USD",
        destinationId: destination.id,
        idempotencyKey: newId(),
        correlationId: newId(),
      }),
    ).rejects.toMatchObject({ code: "insufficient_funds" });

    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'finance.manage'),
             ((select id from identity_capability.accounts where uuid=$1),'finance.read')
       on conflict do nothing`,
      [value.seller.id],
    );
    const funding = await app.fundingService.create({
      accountId: value.seller.id,
      amountMinor: 1_000n,
      providerName: "development",
      idempotencyKey: newId(),
    });
    await app.fundingInitialization.process(funding.id);
    expect((await app.fundingVerification.process(funding.id))?.state).toBe("confirmed");
    const walletCredit = await app.walletCredit.process(funding.id);
    await app.walletAvailability.process(walletCredit!.id);
    const fundingTransfer = await app.walletTransfers.transfer({
      accountId: value.seller.id,
      from: "funding",
      to: "earnings",
      grossMinor: 1_000n,
      idempotencyKey: newId(),
    });
    await app.earningsAdjustments.create(value.seller.id, {
      accountId: value.seller.id,
      amountMinor: (-BigInt(fundingTransfer.netMinor)).toString(),
      reason: "Consume fixture Funding balance before recovery test",
      idempotencyKey: newId(),
    });
    const fundingReversal = await app.fundingReversals.createByOperator({
      actorId: value.seller.id,
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Verify pending Earnings are not recoverable",
      idempotencyKey: newId(),
    });
    expect(fundingReversal.recovery).toMatchObject({
      earningsWalletMinor: "0",
      debtMinor: "1000",
    });
    expect(await reversalRepository.availableEarnings(value.seller.id)).toBe(0n);

    await app.accountDebt.increase({
      accountId: value.seller.id,
      amountMinor: 2_000n,
      wallet: "account",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Complete the debt-first settlement fixture",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: newId(),
    });
    expect(await app.accountDebt.balance(value.seller.id, value.seller.id)).toBe("3000");

    const maturity = new Date(Date.now() + 1_000);
    const firstSettlement = await app.settlement.settle({ now: maturity, batchSize: 10 });
    expect(firstSettlement).toEqual({ claimed: 1, settled: 1 });
    expect(await app.accountDebt.balance(value.seller.id, value.seller.id)).toBe("0");
    expect(await spendable()).toBe(7_000n);
    expect(await app.fundsReservation.available(value.seller.id, "USD")).toBe(7_000n);
    expect(await reversalRepository.availableEarnings(value.seller.id)).toBe(7_000n);

    const persisted = await app.database.query<{ count: number }>(
      `select count(*)::int count from ledger_capability.entry_settlements
        where original_entry_id=(select id from ledger_capability.entries where uuid=$1)
          and from_state='pending' and to_state='available'`,
      [earning.id],
    );
    expect(persisted.rows[0]?.count).toBe(1);
    const debtSettlement = await app.database.query<{ amount: string; count: number }>(
      `select coalesce(sum(amount_minor),0)::text amount,count(*)::int count
         from ledger_capability.account_debt_entries
        where account_id=(select id from identity_capability.accounts where uuid=$1)
          and kind='settlement' and source_kind='purchase_earning' and source_id=$2`,
      [value.seller.id, earning.id],
    );
    expect(debtSettlement.rows[0]).toEqual({ amount: "3000", count: 1 });

    expect(await app.settlement.settle({ now: maturity, batchSize: 10 })).toEqual({
      claimed: 0,
      settled: 0,
    });
    expect(await app.accountDebt.balance(value.seller.id, value.seller.id)).toBe("0");
    expect(await app.fundsReservation.available(value.seller.id, "USD")).toBe(7_000n);

    await app.database.query(
      `update ledger_capability.distribution_policy set settlement_delay_seconds=3600`,
    );
    const future = await completed();
    await app.purchaseDistribution.process({
      purchaseId: future.purchaseId,
      correlationId: newId(),
    });
    const futureEarning = (await app.ledger.findEntriesByPurchaseId(future.purchaseId)).find(
      (entry) => entry.recipientRole === "seller",
    )!;
    expect(futureEarning.balanceState).toBe("pending");
    expect(futureEarning.maturityAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await app.fundsReservation.available(future.seller.id, "USD")).toBe(0n);
    expect(
      await app.database.query(
        `select 1 from ledger_capability.entry_settlements
          where original_entry_id=(select id from ledger_capability.entries where uuid=$1)`,
        [futureEarning.id],
      ),
    ).toMatchObject({ rowCount: 0 });
  });

  it("settles newly-created pre-maturity debt and caps it at the earning amount", async () => {
    await app.database.query(
      `update ledger_capability.distribution_policy set initial_balance_state='pending',settlement_delay_seconds=3600`,
    );
    const value = await completed();
    await grantFinanceRead(value.seller.id);
    await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    await app.accountDebt.increase({
      accountId: value.seller.id,
      amountMinor: 100n,
      wallet: "account",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Debt created after distribution",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: newId(),
    });
    await app.settlement.settle({ now: new Date(Date.now() + 3_601_000), batchSize: 10 });
    expect(await app.accountDebt.balance(value.seller.id, value.seller.id)).toBe("16");
    expect(await app.fundsReservation.available(value.seller.id, "USD")).toBe(0n);
  });

  it("settles debt immediately when purchase earnings are created available", async () => {
    const value = await completed();
    await grantFinanceRead(value.seller.id);
    await app.accountDebt.increase({
      accountId: value.seller.id,
      amountMinor: 100n,
      wallet: "account",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Existing debt before immediately available earning",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: newId(),
    });
    await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    expect(await app.accountDebt.balance(value.seller.id, value.seller.id)).toBe("16");
    expect(await app.fundsReservation.available(value.seller.id, "USD")).toBe(0n);
  });

  it("creates historical compensating entries and revokes entitlement through outbox", async () => {
    const value = await completed();
    await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    const originals = await app.ledger.findEntriesByPurchaseId(value.purchaseId);
    const reversal = await app.purchaseReversal.process({
      purchaseId: value.purchaseId,
      reason: "operator-approved refund",
      source: "operator",
      idempotencyKey: "reverse-1",
      correlationId: newId(),
    });
    await expect(
      app.purchaseReversal.process({
        purchaseId: value.purchaseId,
        reason: "ignored duplicate",
        source: "operator",
        idempotencyKey: "reverse-2",
        correlationId: newId(),
      }),
    ).resolves.toMatchObject({ id: reversal.id });
    const after = await app.ledger.findEntriesByPurchaseId(value.purchaseId);
    expect(
      after.filter((e) => e.reversalId === undefined).map((e) => e.amount.minorAmount),
    ).toEqual(originals.map((e) => e.amount.minorAmount));
    expect(
      after.filter((e) => e.reversalId).reduce((sum, e) => sum + e.amount.minorAmount, 0n),
    ).toBe(101n);
    const dispatcher = new OutboxDispatcher(
      "reversal-test",
      app.outbox,
      new OutboxHandlerRegistry()
        .register(new AuditedFactHandler())
        .register(
          new (await import("@/workers/outbox/handlers")).PurchaseReversalEntitlementHandler(
            app.entitlements,
          ),
        ),
      { info: () => undefined, error: () => undefined },
      { pollMilliseconds: 1, staleAfterMilliseconds: 1000 },
    );
    await dispatcher.runOnce();
    expect((await app.entitlements.findByPurchaseId(value.purchaseId))?.isActive).toBe(false);
    expect(
      (await app.ledger.summarizeAccount(value.seller.id)).find(
        (s) => s.balanceState === "reversed",
      )?.amountMinor,
    ).toBe(0n);
  });

  it("preserves consumed entitlement history when a purchase is reversed", async () => {
    const value = await completed();
    const entitlement = await app.entitlements.findByPurchaseId(value.purchaseId);
    expect(entitlement).not.toBeNull();
    entitlement!.consume();
    await app.entitlements.save(entitlement!);
    await app.purchaseDistribution.process({
      purchaseId: value.purchaseId,
      correlationId: newId(),
    });
    await app.purchaseReversal.process({
      purchaseId: value.purchaseId,
      reason: "refund after one-time use",
      source: "operator",
      idempotencyKey: "reverse-consumed-entitlement",
      correlationId: newId(),
    });
    const dispatcher = new OutboxDispatcher(
      "reversal-consumed-test",
      app.outbox,
      new OutboxHandlerRegistry()
        .register(new AuditedFactHandler())
        .register(
          new (await import("@/workers/outbox/handlers")).PurchaseReversalEntitlementHandler(
            app.entitlements,
          ),
        ),
      { info: () => undefined, error: () => undefined },
      { pollMilliseconds: 1, staleAfterMilliseconds: 1000 },
    );
    await dispatcher.runOnce();
    expect((await app.entitlements.findByPurchaseId(value.purchaseId))?.state).toBe("consumed");
  });
});
