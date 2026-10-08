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
      full: true,
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
});
