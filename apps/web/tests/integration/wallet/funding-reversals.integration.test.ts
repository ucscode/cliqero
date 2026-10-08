import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("provider funding reversal recovery", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(async () => {
    await app.database.query(
      `truncate table wallet_capability.debits,wallet_capability.credits,checkout_capability.checkouts,funding_capability.funding_transactions,ledger_capability.entries,ledger_capability.purchase_distributions,access_capability.access_grants,entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`,
    );
  });
  afterAll(() => app.database.close());

  async function account() {
    const value = await app.authentication.register({
      email: `reversal-${newId()}@example.test`,
      username: `rv${newId().slice(0, 10)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability) values((select id from identity_capability.accounts where uuid=$1),'finance.manage')`,
      [value.id],
    );
    return value;
  }
  async function confirmedFunding(accountId: string, amountMinor: bigint) {
    const value = await app.fundingService.create({
      accountId,
      amountMinor,
      providerName: "development",
      idempotencyKey: `reversal-${newId()}`,
    });
    await app.fundingInitialization.process(value.id);
    const confirmed = await app.fundingVerification.process(value.id);
    expect(confirmed?.state).toBe("confirmed");
    return confirmed!;
  }

  async function providerRefund(
    funding: { id: string; providerReference: string },
    amount: string,
  ) {
    const eventId = newId();
    await app.providerEvents.record({
      id: eventId,
      providerName: "development",
      eventKey: `refund:${eventId}`,
      eventType: "refund.processed",
      providerReference: funding.providerReference,
      amountMinor: amount,
      currency: "NGN",
      payload: {},
    });
    return app.fundingReversals.applyProviderEvent({
      eventId,
      providerName: "development",
      providerReference: funding.providerReference,
      amountMinor: amount,
      currency: "NGN",
      providerReversalReference: `refund:${eventId}`,
      reason: "Provider refund",
    });
  }

  async function addEarningEntry(
    accountId: string,
    options: {
      direction: "credit" | "debit";
      amount: string;
      state?: "pending" | "available";
      maturityAt?: Date;
      originalEntryId?: string;
    },
  ) {
    const id = newId();
    await app.database.query(
      `insert into ledger_capability.entries
        (uuid,entry_type,direction,amount_minor,currency,idempotency_key,correlation_id,
         balance_state,maturity_at,account_id,original_entry_id)
       values($1,$2,$3,$4,'USD',$5,$1,$6,$7,
         (select id from identity_capability.accounts where uuid=$8),
         (select id from ledger_capability.entries where uuid=$9))`,
      [
        id,
        options.direction === "debit" ? "purchase-reversal" : "purchase-earnings",
        options.direction,
        options.amount,
        `reversal-earnings-entry:${id}`,
        options.state ?? "available",
        options.maturityAt ?? null,
        accountId,
        options.originalEntryId ?? null,
      ],
    );
    return id;
  }

  async function spendFundingWithoutSpendableEarnings(ownerId: string, fundingId: string) {
    const credit = await app.walletCredit.process(fundingId);
    await app.walletAvailability.process(credit!.id);
    const transfer = await app.walletTransfers.transfer({
      accountId: ownerId,
      from: "funding",
      to: "earnings",
      grossMinor: 1000n,
      idempotencyKey: `consume-funding:${newId()}`,
    });
    await app.earningsAdjustments.create(ownerId, {
      accountId: ownerId,
      amountMinor: (-BigInt(transfer.netMinor)).toString(),
      reason: "Integration fixture consumes transferred value",
      idempotencyKey: `consume-earnings:${newId()}`,
    });
  }

  it("neutralizes a full reversal before any credit exists and keeps retries idempotent", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const input = {
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Provider chargeback",
      idempotencyKey: "reversal-no-credit",
    };
    const first = await app.fundingReversals.createByOperator(input);
    const retry = await app.fundingReversals.createByOperator(input);
    expect(retry.id).toBe(first.id);
    expect(first.recovery).toMatchObject({
      pendingCreditMinor: "1000",
      fundingWalletMinor: "0",
      earningsWalletMinor: "0",
      debtMinor: "0",
    });
    expect(await app.walletCredit.process(funding.id)).toBeNull();
    expect(await app.walletRepository.findCreditByFunding(funding.id)).toBeNull();
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(0n);
    const debt = await app.database.query<{ amount: string }>(
      `select coalesce(sum(case when kind='increase' then amount_minor else -amount_minor end),0)::text amount from ledger_capability.account_debt_entries where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [owner.id],
    );
    expect(debt.rows[0]?.amount).toBe("0");
    expect(await app.fundingReversals.summary(funding.id)).toEqual({
      state: "full",
      reversedAmountMinor: "1000",
      remainingAmountMinor: "0",
    });
    await expect(
      app.fundingCreditReconciliation.reconcile({
        actorId: owner.id,
        fundingId: funding.id,
        idempotencyKey: "reconcile-fully-reversed",
      }),
    ).rejects.toMatchObject({ code: "funding_fully_reversed", status: 409 });
  });

  it("reconciles a missing partial credit only to the unreversed canonical remainder", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "300",
      reason: "Partial refund before credit",
      idempotencyKey: "reversal-before-credit-300",
    });
    const result = await app.fundingCreditReconciliation.reconcile({
      actorId: owner.id,
      fundingId: funding.id,
      idempotencyKey: "reconcile-partially-reversed",
    });
    expect(result.state).toBe("available");
    expect((await app.walletRepository.findCreditByFunding(funding.id))?.amount.minorAmount).toBe(
      700n,
    );
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(700n);
  });

  it("reduces pending credit before availability and only settles the remaining inflow", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    expect(credit?.amount.minorAmount).toBe(1000n);
    const reversal = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "300",
      reason: "Partial provider refund",
      idempotencyKey: "reversal-pending-partial",
    });
    expect(reversal.recovery.pendingCreditMinor).toBe("300");
    expect((await app.walletRepository.findCreditByFunding(funding.id))?.amount.minorAmount).toBe(
      700n,
    );
    expect(await app.walletAvailability.process(credit!.id)).toBe(true);
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(700n);
    expect((await app.wallet.summary(owner.id)).pending.minorAmount).toBe(0n);
  });

  it("recovers available Funding first and supports exact partial reversals", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    await app.walletAvailability.process(credit!.id);
    const first = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "300",
      reason: "Partial provider refund",
      idempotencyKey: "reversal-available-300",
    });
    expect(first.recovery).toMatchObject({
      pendingCreditMinor: "0",
      fundingWalletMinor: "300",
      earningsWalletMinor: "0",
      debtMinor: "0",
    });
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(700n);
    expect(await app.fundingReversals.summary(funding.id)).toEqual({
      state: "partial",
      reversedAmountMinor: "300",
      remainingAmountMinor: "700",
    });
    const second = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "700",
      reason: "Remaining provider refund",
      idempotencyKey: "reversal-available-700",
    });
    expect(second.recovery.fundingWalletMinor).toBe("700");
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(0n);
    await expect(
      app.fundingReversals.createByOperator({
        actorId: owner.id,
        fundingId: funding.id,
        amountMinor: "1",
        reason: "Over reversal",
        idempotencyKey: "reversal-over",
      }),
    ).rejects.toMatchObject({ code: "funding_reversal_exceeds_remaining", status: 409 });
  });

  it("does not make a fully neutralized pending credit available or settle debt from it", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    const reversal = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Full provider refund",
      idempotencyKey: "reversal-pending-full",
    });
    expect(reversal.recovery.pendingCreditMinor).toBe("1000");
    expect((await app.walletRepository.findCreditByFunding(funding.id))?.state).toBe("cancelled");
    expect(await app.walletAvailability.process(credit!.id)).toBe(false);
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(0n);
    expect((await app.wallet.summary(owner.id)).pending.minorAmount).toBe(0n);
    const debt = await app.database.query(
      `select 1 from ledger_capability.account_debt_entries where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [owner.id],
    );
    expect(debt.rowCount).toBe(0);
  });

  it("serializes concurrent partial reversals and never exceeds remaining funding", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    await app.walletAvailability.process(credit!.id);
    const outcomes = await Promise.allSettled(
      [1, 2].map((index) =>
        app.fundingReversals.createByOperator({
          actorId: owner.id,
          fundingId: funding.id,
          amountMinor: "700",
          reason: "Concurrent partial refund",
          idempotencyKey: `concurrent-reversal-${index}`,
        }),
      ),
    );
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await app.fundingReversals.summary(funding.id)).toEqual({
      state: "partial",
      reversedAmountMinor: "700",
      remainingAmountMinor: "300",
    });
  });

  it("serializes the credit-creation and reversal race without recreating reversed value", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const [, reversal] = await Promise.all([
      app.walletCredit.process(funding.id),
      app.fundingReversals.createByOperator({
        actorId: owner.id,
        fundingId: funding.id,
        amountMinor: "1000",
        reason: "Concurrent provider reversal",
        idempotencyKey: "reversal-credit-race",
      }),
    ]);
    expect(reversal.recovery.pendingCreditMinor).toBe("1000");
    const retryCredit = await app.walletCredit.process(funding.id);
    expect([null, "cancelled"]).toContain(retryCredit?.state ?? null);
    const persisted = await app.walletRepository.findCreditByFunding(funding.id);
    expect([null, "cancelled"]).toContain(persisted?.state ?? null);
    if (persisted) expect(await app.walletAvailability.process(persisted.id)).toBe(false);
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(0n);
  });

  it("serializes reversal against pending-credit availability", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    await Promise.all([
      app.walletAvailability.process(credit!.id),
      app.fundingReversals.createByOperator({
        actorId: owner.id,
        fundingId: funding.id,
        amountMinor: "1000",
        reason: "Concurrent provider reversal",
        idempotencyKey: "reversal-availability-race",
      }),
    ]);
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(0n);
    expect((await app.wallet.summary(owner.id)).pending.minorAmount).toBe(0n);
    const debt = await app.database.query(
      `select 1 from ledger_capability.account_debt_entries where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [owner.id],
    );
    expect(debt.rowCount).toBe(0);
  });

  it("reuses the committed reversal after a provider-event acknowledgement boundary", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const eventId = newId();
    await app.providerEvents.record({
      id: eventId,
      providerName: "development",
      eventKey: `refund:${eventId}`,
      eventType: "refund.processed",
      providerReference: funding.providerReference,
      amountMinor: "1000",
      currency: "USD",
      payload: {},
    });
    const normalized = {
      eventId,
      providerName: "development",
      providerReference: funding.providerReference,
      amountMinor: "1000",
      currency: "USD",
      providerReversalReference: `refund:${eventId}`,
      reason: "Provider refund",
    };
    const committedBeforeAck = await app.fundingReversals.applyProviderEvent(normalized);
    const replay = await app.fundingReversals.applyProviderEvent(normalized);
    expect(replay.id).toBe(committedBeforeAck.id);
    const persisted = await app.database.query<{ count: string }>(
      `select count(*)::text count from funding_capability.funding_reversals where provider_event_id=$1`,
      [eventId],
    );
    expect(persisted.rows[0]?.count).toBe("1");
    await app.providerEvents.markProcessed(eventId);
    expect((await app.providerEvents.findById(eventId))?.state).toBe("processed");
  });

  it("classifies administrative funding as a 409 while preserving 404 for unknown funding", async () => {
    const owner = await account();
    const administrative = await app.operatorFunding.createAdministrative(owner.id, {
      accountId: owner.id,
      amountMinor: "1000",
      state: "confirmed",
      reason: "Administrative test funding",
      idempotencyKey: "reversal-admin-origin",
    });
    await expect(
      app.fundingReversals.createByOperator({
        actorId: owner.id,
        fundingId: administrative.id,
        amountMinor: "1",
        reason: "Not provider-origin",
        idempotencyKey: "reversal-admin-origin-attempt",
      }),
    ).rejects.toMatchObject({ code: "provider_funding_required", status: 409 });
    await expect(
      app.fundingReversals.createByOperator({
        actorId: owner.id,
        fundingId: newId(),
        amountMinor: "1",
        reason: "Unknown funding",
        idempotencyKey: "reversal-missing-origin-attempt",
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("preserves prior debt settlement history and creates only the new reversal exposure", async () => {
    const owner = await account();
    await app.accountDebt.increase({
      accountId: owner.id,
      amountMinor: 400n,
      wallet: "account",
      sourceKind: "prior_case",
      sourceId: newId(),
      reason: "Pre-existing account debt",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: "prior-account-debt",
    });
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    await app.walletAvailability.process(credit!.id);
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(600n);
    const reversal = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Provider chargeback after prior debt settlement",
      idempotencyKey: "reversal-prior-debt",
    });
    expect(reversal.recovery).toMatchObject({
      fundingWalletMinor: "600",
      earningsWalletMinor: "0",
      debtMinor: "400",
    });
    const entries = await app.database.query<{ kind: string; amount: string }>(
      `select kind,amount_minor::text amount from ledger_capability.account_debt_entries
        where account_id=(select id from identity_capability.accounts where uuid=$1) order by created_at,id`,
      [owner.id],
    );
    expect(entries.rows.map((row) => [row.kind, row.amount])).toEqual([
      ["increase", "400"],
      ["settlement", "400"],
      ["increase", "400"],
    ]);
  });

  it("recovers safe available earnings only after Funding and records the residual debt", async () => {
    const owner = await account();
    await app.accountDebt.increase({
      accountId: owner.id,
      amountMinor: 400n,
      wallet: "account",
      sourceKind: "prior_case",
      sourceId: newId(),
      reason: "Pre-existing debt settled by funding",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: "cross-wallet-prior-debt",
    });
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    await app.walletAvailability.process(credit!.id);
    await app.earningsAdjustments.create(owner.id, {
      accountId: owner.id,
      amountMinor: "250",
      reason: "Recovery integration earnings fixture",
      idempotencyKey: "reversal-earnings-fixture",
    });
    const reversal = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Cross-wallet provider reversal",
      idempotencyKey: "reversal-cross-wallet",
    });
    expect(reversal.recovery).toMatchObject({
      fundingWalletMinor: "600",
      earningsWalletMinor: "250",
      debtMinor: "150",
    });
  });

  it("converts cumulative Paystack-style collection refunds without per-event rounding drift", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    await app.database.query(
      `update funding_capability.funding_transactions
          set collection_amount_minor=3333,collection_currency='NGN'
        where uuid=$1`,
      [funding.id],
    );
    const first = await providerRefund(funding, "1111");
    const second = await providerRefund(funding, "1111");
    const third = await providerRefund(funding, "1111");
    expect([first.amountMinor, second.amountMinor, third.amountMinor]).toEqual([
      "333",
      "334",
      "333",
    ]);
    expect(third.providerCollectionAmountMinor).toBe("1111");
    expect(third.providerCollectionCurrency).toBe("NGN");
    expect(await app.fundingReversals.summary(funding.id)).toMatchObject({
      state: "full",
      reversedAmountMinor: "1000",
      remainingAmountMinor: "0",
    });
  });

  it("serializes concurrent provider refund events and caps mixed manual/provider reversals", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    await app.database.query(
      `update funding_capability.funding_transactions
          set collection_amount_minor=3333,collection_currency='NGN'
        where uuid=$1`,
      [funding.id],
    );
    const events = await Promise.all([
      providerRefund(funding, "1111"),
      providerRefund(funding, "1111"),
      providerRefund(funding, "1111"),
    ]);
    expect(events.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)).toBe(1000n);
    expect(await app.fundingReversals.summary(funding.id)).toMatchObject({
      state: "full",
      reversedAmountMinor: "1000",
      remainingAmountMinor: "0",
    });

    const mixed = await confirmedFunding(owner.id, 1000n);
    await app.database.query(
      `update funding_capability.funding_transactions
          set collection_amount_minor=3,collection_currency='NGN'
        where uuid=$1`,
      [mixed.id],
    );
    await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: mixed.id,
      amountMinor: "500",
      reason: "Manual partial before provider refund",
      idempotencyKey: "manual-before-provider-refund",
    });
    const providerPartial = await providerRefund(mixed, "2");
    const providerFull = await providerRefund(mixed, "1");
    expect(providerPartial.amountMinor).toBe("500");
    expect(providerFull.amountMinor).toBe("0");
    expect(await app.fundingReversals.summary(mixed.id)).toMatchObject({
      state: "full",
      reversedAmountMinor: "1000",
      remainingAmountMinor: "0",
    });
  });

  it("rejects provider collection refunds above the original without persisting a reversal", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    await app.database.query(
      `update funding_capability.funding_transactions
          set collection_amount_minor=3333,collection_currency='NGN'
        where uuid=$1`,
      [funding.id],
    );
    await expect(providerRefund(funding, "3334")).rejects.toMatchObject({
      code: "funding_reversal_exceeds_remaining",
      status: 409,
    });
    expect(await app.fundingReversals.summary(funding.id)).toMatchObject({
      state: "none",
      reversedAmountMinor: "0",
      remainingAmountMinor: "1000",
    });
  });

  it("records zero-delta provider evidence and applies the remaining canonical unit only when cumulative conversion reaches it", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1n);
    await app.database.query(
      `update funding_capability.funding_transactions
          set collection_amount_minor=3333,collection_currency='NGN'
        where uuid=$1`,
      [funding.id],
    );
    const first = await providerRefund(funding, "1");
    expect(first.amountMinor).toBe("0");
    expect(first.providerCollectionAmountMinor).toBe("1");
    expect(first.recovery).toEqual({
      pendingCreditMinor: "0",
      fundingWalletMinor: "0",
      earningsWalletMinor: "0",
      debtMinor: "0",
    });
    const rest = await providerRefund(funding, "3332");
    expect(rest.amountMinor).toBe("1");
    expect(await app.fundingReversals.summary(funding.id)).toMatchObject({
      state: "full",
      reversedAmountMinor: "1",
      remainingAmountMinor: "0",
    });
  });

  it("preserves microsecond precision across reversal cursor pages", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const created = ["123456", "123457", "123458"].map((micros, index) => ({
      id: newId(),
      key: `cursor-micro-${index}`,
      timestamp: `2026-10-08T10:11:12.${micros}Z`,
    }));
    for (const row of created)
      await app.database.query(
        `insert into funding_capability.funding_reversals
          (uuid,funding_id,account_id,amount_minor,currency,source,reason,idempotency_key,
           request_fingerprint,correlation_id,created_by,pending_credit_minor,funding_wallet_minor,
           earnings_wallet_minor,debt_minor,created_at)
         values($1,(select id from funding_capability.funding_transactions where uuid=$2),
           (select id from identity_capability.accounts where uuid=$3),1,'USD','operator','cursor fixture',
           $4,'{}',$1,(select id from identity_capability.accounts where uuid=$3),0,1,0,0,$5::timestamptz)`,
        [row.id, funding.id, owner.id, row.key, row.timestamp],
      );
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await app.fundingReversals.list({ accountId: owner.id, limit: 1, cursor });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual([...created].reverse().map((row) => row.id));
  });

  it("excludes a fully reversed purchase earning before Funding Reversal recovery", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    await spendFundingWithoutSpendableEarnings(owner.id, funding.id);
    const original = await addEarningEntry(owner.id, { direction: "credit", amount: "100" });
    await addEarningEntry(owner.id, {
      direction: "debit",
      amount: "100",
      originalEntryId: original,
    });
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(0n);
    const reversal = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Provider reversal after purchase reversal",
      idempotencyKey: "fully-reversed-earnings",
    });
    expect(reversal.recovery.earningsWalletMinor).toBe("0");
    expect(reversal.recovery.debtMinor).toBe("1000");
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(0n);
  });

  it("caps recovery at net available purchase earnings and excludes unsettled matured entries", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    await spendFundingWithoutSpendableEarnings(owner.id, funding.id);
    const original = await addEarningEntry(owner.id, { direction: "credit", amount: "100" });
    await addEarningEntry(owner.id, {
      direction: "debit",
      amount: "40",
      originalEntryId: original,
    });
    await addEarningEntry(owner.id, {
      direction: "credit",
      amount: "1000",
      state: "pending",
      maturityAt: new Date(Date.now() + 60_000),
    });
    await addEarningEntry(owner.id, {
      direction: "credit",
      amount: "20",
      state: "pending",
      maturityAt: new Date(Date.now() - 60_000),
    });
    // A past maturity timestamp does not make a pending earning available;
    // the settlement processor must first commit its availability transition.
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(60n);
    const reversal = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Recover only available net earnings",
      idempotencyKey: "net-earnings-recovery",
    });
    expect(reversal.recovery.earningsWalletMinor).toBe("60");
    expect(reversal.recovery.debtMinor).toBe("940");
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(0n);
  });

  it("root deletion removes directly linked funding debt and audits the removed evidence", async () => {
    const owner = await account();
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [owner.id],
    );
    await app.accountDebt.increase({
      accountId: owner.id,
      amountMinor: 400n,
      wallet: "account",
      sourceKind: "prior_case",
      sourceId: newId(),
      reason: "Pre-existing receivable",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: "root-delete-prior-debt",
    });
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    expect(await app.walletAvailability.process(credit!.id)).toBe(true);
    const linked = await app.database.query<{ source_kind: string; source_id: string }>(
      `select source_kind,source_id from ledger_capability.account_debt_entries
        where source_kind='wallet_funding_credit'`,
    );
    expect(linked.rows).toHaveLength(1);
    await app.operatorFunding.deleteByOperator(owner.id, funding.id);
    const entries = await app.database.query<{ kind: string; source_kind: string; amount: string }>(
      `select kind,source_kind,amount_minor::text amount
         from ledger_capability.account_debt_entries
        where account_id=(select id from identity_capability.accounts where uuid=$1)
        order by created_at,id`,
      [owner.id],
    );
    expect(entries.rows).toEqual([{ kind: "increase", source_kind: "prior_case", amount: "400" }]);
    const audit = await app.database.query<{ previous_state: any }>(
      `select previous_state from kernel.audit_records
        where subject_type='funding_transaction' and subject_id=$1 and action='root.delete'`,
      [funding.id],
    );
    expect(audit.rows[0]?.previous_state.linkedDebt).toHaveLength(1);
  });

  it("rejects root deletion when independent later debt settlement depends on reversal debt", async () => {
    const owner = await account();
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [owner.id],
    );
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    await app.walletAvailability.process(credit!.id);
    const transfer = await app.walletTransfers.transfer({
      accountId: owner.id,
      from: "funding",
      to: "earnings",
      grossMinor: 1000n,
      idempotencyKey: `root-delete-spend:${newId()}`,
    });
    await app.earningsAdjustments.create(owner.id, {
      accountId: owner.id,
      amountMinor: (-BigInt(transfer.netMinor)).toString(),
      reason: "Consume transfer for root deletion fixture",
      idempotencyKey: `root-delete-spend-adjustment:${newId()}`,
    });
    const reversal = await app.fundingReversals.createByOperator({
      actorId: owner.id,
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Create linked reversal debt",
      idempotencyKey: "root-delete-reversal-debt",
    });
    expect(reversal.recovery.debtMinor).toBe("1000");
    await app.accountDebt.settleInflow({
      accountId: owner.id,
      incomingMinor: 100n,
      wallet: "funding",
      sourceKind: "independent_funding",
      sourceId: newId(),
      reason: "Subsequent independent inflow",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: "root-delete-independent-settlement",
    });
    await expect(app.operatorFunding.deleteByOperator(owner.id, funding.id)).rejects.toMatchObject({
      code: "funding_delete_debt_dependency_conflict",
      status: 409,
    });
    expect(await app.fundingReversals.get(reversal.id)).not.toBeNull();
    expect(await app.funding.findById(funding.id)).not.toBeNull();
    const debt = await app.database.query<{ amount: string }>(
      `select coalesce(sum(case when kind='increase' then amount_minor else -amount_minor end),0)::text amount
         from ledger_capability.account_debt_entries
        where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [owner.id],
    );
    expect(debt.rows[0]?.amount).toBe("900");
  });

  it("serializes withdrawal reservation against Funding Reversal recovery", async () => {
    const owner = await account();
    const funding = await confirmedFunding(owner.id, 1000n);
    const credit = await app.walletCredit.process(funding.id);
    await app.walletAvailability.process(credit!.id);
    const transfer = await app.walletTransfers.transfer({
      accountId: owner.id,
      from: "funding",
      to: "earnings",
      grossMinor: 1000n,
      idempotencyKey: `concurrent-economic-lock:${newId()}`,
    });
    await app.earningsAdjustments.create(owner.id, {
      accountId: owner.id,
      amountMinor: (-BigInt(transfer.netMinor)).toString(),
      reason: "Clear transfer fixture earnings",
      idempotencyKey: `concurrent-economic-lock-clear:${newId()}`,
    });
    await app.earningsAdjustments.create(owner.id, {
      accountId: owner.id,
      amountMinor: "1000",
      reason: "Concurrent reservation fixture earnings",
      idempotencyKey: `concurrent-economic-lock-earnings:${newId()}`,
    });
    const destination = await app.withdrawalDestinations.create(owner.id, {
      method: "bank_ng",
      name: "Concurrent test destination",
      values: { bank_name: "Test Bank", account_number: "0123456789", account_name: "Owner" },
    });
    const outcomes = await Promise.allSettled([
      app.withdrawals.create({
        accountId: owner.id,
        amountMinor: 700n,
        currency: "USD",
        destinationId: destination.id,
        idempotencyKey: `concurrent-withdrawal:${newId()}`,
        correlationId: newId(),
      }),
      app.fundingReversals.createByOperator({
        actorId: owner.id,
        fundingId: funding.id,
        amountMinor: "1000",
        reason: "Concurrent funding recovery",
        idempotencyKey: `concurrent-funding-reversal:${newId()}`,
      }),
    ]);
    const [withdrawal, reversal] = outcomes;
    expect(reversal.status).toBe("fulfilled");
    if (withdrawal.status === "fulfilled" && reversal.status === "fulfilled")
      expect(BigInt(reversal.value.recovery.earningsWalletMinor) + 700n).toBeLessThanOrEqual(1000n);
    else if (withdrawal.status === "rejected" && reversal.status === "fulfilled")
      expect(BigInt(reversal.value.recovery.earningsWalletMinor)).toBeLessThanOrEqual(1000n);
    else if (withdrawal.status === "fulfilled" && reversal.status === "rejected")
      expect((await app.fundsReservation.summarize(owner.id))[0].reservedMinor).toBe(700n);
    expect(await app.fundsReservation.available(owner.id, "USD")).toBeGreaterThanOrEqual(0n);
  });
});
