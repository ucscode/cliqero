import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { feePolicyFromYaml } from "@/modules/fee/policy";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const defaultFees = feePolicyFromYaml({
  enabled: true,
  withdrawal: { enabled: true, percentage: 0, maximum_amount_minor: null },
  funding_to_earning: { enabled: true, percentage: 5, maximum_amount_minor: null },
  earning_to_funding: { enabled: true, percentage: 5, maximum_amount_minor: null },
});
let fees = defaultFees;

suite("wallet transfer compensation", () => {
  const app = createContainer(databaseUrl!, { feePolicySource: { getActive: () => fees } });

  beforeEach(async () => {
    fees = defaultFees;
    await app.database.query(
      `truncate table wallet_capability.transfer_compensations,wallet_capability.transfer_entries,
       wallet_capability.transfers,ledger_capability.earnings_adjustments,
       treasury_capability.entries,treasury_capability.adjustments,
       ledger_capability.account_debt_entries,ledger_capability.withdrawal_reservation_events,
       ledger_capability.withdrawal_reservations,withdrawal_capability.withdrawals,
       withdrawal_capability.destinations,wallet_capability.debits,wallet_capability.credits,
       checkout_capability.checkouts,funding_capability.funding_transactions,
       ledger_capability.entries,ledger_capability.purchase_distributions,
       access_capability.access_grants,entitlement_capability.entitlements,
       purchase_capability.purchases,payment_capability.payments,listing_capability.listings,
       identity_capability.account_capabilities,identity_capability.sessions,
       identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records
       restart identity cascade`,
    );
  });
  afterAll(() => app.database.close());

  async function account() {
    const value = await app.authentication.register({
      email: `transfer-comp-${newId()}@example.test`,
      username: `tc${newId().replaceAll("-", "").slice(0, 12)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'finance.manage'),
             ((select id from identity_capability.accounts where uuid=$1),'finance.read')`,
      [value.id],
    );
    return value;
  }

  async function fund(accountId: string, amountMinor: bigint) {
    const funding = await app.fundingService.create({
      accountId,
      amountMinor,
      providerName: "development",
      idempotencyKey: `transfer-comp-funding-${newId()}`,
    });
    await app.fundingInitialization.process(funding.id);
    expect((await app.fundingVerification.process(funding.id))?.state).toBe("confirmed");
    const credit = await app.walletCredit.process(funding.id);
    await app.walletAvailability.process(credit!.id);
    return funding;
  }

  async function transfer(accountId: string, from: "funding" | "earnings", grossMinor: bigint) {
    return app.walletTransfers.transfer({
      accountId,
      from,
      to: from === "funding" ? "earnings" : "funding",
      grossMinor,
      idempotencyKey: `transfer-${newId()}`,
    });
  }

  async function compensate(
    actorId: string,
    transferId: string,
    key = newId(),
    reason = "Transfer correction",
  ) {
    return app.walletTransferCompensations.createByOperator({
      actorId,
      transferId,
      reason,
      idempotencyKey: key,
    });
  }

  async function insertEarningsSpendFixture(
    accountId: string,
    amountMinor: bigint,
    reason: string,
  ) {
    // Seed an append-only negative fact directly; public manual adjustments are positive-only.
    await app.database.query(
      `insert into ledger_capability.earnings_adjustments
        (uuid,account_id,amount_minor,reason,created_by,correlation_id,idempotency_key)
       select gen_random_uuid(),account.id,$2,$3,account.id,gen_random_uuid(),$4
         from identity_capability.accounts account where account.uuid=$1`,
      [accountId, (-amountMinor).toString(), reason, newId()],
    );
  }

  async function treasuryBalance() {
    return (await app.treasuryRepository.summary()).balanceMinor;
  }

  it("fully compensates Funding to Earnings, refunds the fee once, preserves history and original facts", async () => {
    const owner = await account();
    await fund(owner.id, 5_000n);
    const original = await transfer(owner.id, "funding", 1_000n);
    expect(original).toMatchObject({ grossMinor: "1000", feeMinor: "50", netMinor: "950" });
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(4_000n);
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(950n);
    expect(await treasuryBalance()).toBe(50n);

    const result = await compensate(owner.id, original.id, "full-compensation");
    expect(result).toMatchObject({
      transferId: original.id,
      fromWallet: "funding",
      toWallet: "earnings",
      grossMinor: 1_000n,
      feeMinor: 50n,
      netMinor: 950n,
      recovery: {
        destinationWalletMinor: 950n,
        sourceWalletMinor: 1_000n,
        feeRefundedMinor: 50n,
        debtMinor: 0n,
      },
    });
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(5_000n);
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(0n);
    expect(await treasuryBalance()).toBe(0n);
    expect(await app.accountProjections.earnings(owner.id)).toMatchObject({
      balances: [{ currency: "USD", state: "available", amount_minor: "0" }],
    });
    const earningsHistory = await app.accountProjections.earningEntries(owner.id, { limit: 20 });
    expect(earningsHistory.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: result.id,
          entry_type: "wallet-transfer-compensation",
          direction: "debit",
          amount_minor: "950",
          source: "wallet_transfer_compensation",
          reference: original.id,
        }),
      ]),
    );

    const treasury = await app.database.query<{
      direction: string;
      amount: string;
      source_id: string;
      correlation_id: string;
      actor_kind: string;
      actor_id: string;
    }>(
      `select direction,amount_minor::text amount,source_id::text,correlation_id::text,actor_kind,
              (select uuid::text from identity_capability.accounts where id=actor_id) actor_id
         from treasury_capability.entries where source_kind='wallet_transfer_compensation'`,
    );
    expect(treasury.rows).toEqual([
      {
        direction: "debit",
        amount: "50",
        source_id: result.id,
        correlation_id: result.correlationId,
        actor_kind: "operator",
        actor_id: owner.id,
      },
    ]);
    const persisted = await app.database.query(
      `select uuid from wallet_capability.transfer_compensations
        where transfer_id=(select id from wallet_capability.transfers where uuid=$1)`,
      [original.id],
    );
    expect(persisted.rows).toEqual([{ uuid: result.id }]);
    await expect(
      app.database.query(
        `insert into wallet_capability.transfer_compensations
          (uuid,transfer_id,account_id,from_wallet,to_wallet,gross_minor,fee_minor,net_minor,reason,
           destination_wallet_minor,source_wallet_minor,fee_refunded_minor,debt_minor,created_by,
           correlation_id,idempotency_key)
         values($1,(select id from wallet_capability.transfers where uuid=$2),
           (select id from identity_capability.accounts where uuid=$3),'funding','earnings',
           1001,50,951,'mismatched snapshot',951,1001,50,0,
           (select id from identity_capability.accounts where uuid=$3),$4,'mismatched-snapshot')`,
        [newId(), original.id, owner.id, newId()],
      ),
    ).rejects.toThrow(/must preserve the original transfer snapshot/);
    const audit = await app.database.query<{
      action: string;
      actor_id: string;
      correlation_id: string;
      new_state: { reason: string; transferId: string; feeMinor: string };
    }>(
      `select action,(select uuid from identity_capability.accounts where id=actor_id) actor_id,
              correlation_id::text,new_state
         from kernel.audit_records where subject_type='wallet_transfer_compensation' and subject_id=$1`,
      [result.id],
    );
    expect(audit.rows[0]).toMatchObject({
      action: "wallet.transfer.compensated",
      actor_id: owner.id,
      correlation_id: result.correlationId,
      new_state: { reason: "Transfer correction", transferId: original.id, feeMinor: "50" },
    });
    expect(
      await app.walletTransferCompensations.list({ accountId: owner.id, limit: 10 }),
    ).toMatchObject({
      items: [{ id: result.id, transferId: original.id }],
      nextCursor: null,
    });
    const history = await app.wallet.history(owner.id, { limit: 50 });
    const compensationHistory = history.items.filter(
      (entry) => entry.kind === "wallet_transfer_compensation",
    );
    expect(compensationHistory).toHaveLength(1);
    expect(compensationHistory[0]).toMatchObject({
      direction: "credit",
      sourceId: original.id,
      reference: original.id,
      label: expect.stringContaining("restored 1000, reclaimed 950, fee refunded 50"),
    });
    expect(
      history.items.some(
        (entry) => entry.kind === "funding_transfer" && entry.direction === "debit",
      ),
    ).toBe(true);

    const retry = await compensate(owner.id, original.id, "full-compensation");
    expect(retry.id).toBe(result.id);
    await expect(compensate(owner.id, original.id, "different-key")).rejects.toMatchObject({
      code: "transfer_already_compensated",
      status: 409,
    });
    await expect(
      compensate(owner.id, original.id, "full-compensation", "Different reason"),
    ).rejects.toMatchObject({
      code: "idempotency_conflict",
      status: 409,
    });
    expect(await treasuryBalance()).toBe(0n);
    expect(
      await app.database.query(
        `select 1 from treasury_capability.entries where source_kind='wallet_transfer_compensation'`,
      ),
    ).toMatchObject({ rowCount: 1 });

    await expect(
      app.database.query(`update wallet_capability.transfers set reason='changed' where uuid=$1`, [
        original.id,
      ]),
    ).rejects.toThrow();
    await expect(
      app.database.query(
        `update wallet_capability.transfer_compensations set reason='changed' where uuid=$1`,
        [result.id],
      ),
    ).rejects.toThrow();
  });

  it("supports the reverse Earnings to Funding direction and zero-fee compensation", async () => {
    const owner = await account();
    await fund(owner.id, 4_000n);
    const earningsSeed = await transfer(owner.id, "funding", 2_000n);
    const reverse = await transfer(owner.id, "earnings", 1_000n);
    expect(reverse).toMatchObject({ grossMinor: "1000", feeMinor: "50", netMinor: "950" });
    const before = await treasuryBalance();
    const result = await compensate(owner.id, reverse.id);
    expect(result).toMatchObject({ fromWallet: "earnings", toWallet: "funding" });
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(
      BigInt(earningsSeed.netMinor),
    );
    expect((await app.wallet.summary(owner.id)).available.minorAmount).toBe(
      4_000n - BigInt(earningsSeed.grossMinor),
    );
    expect((await treasuryBalance()) - before).toBe(-50n);

    fees = feePolicyFromYaml({
      enabled: false,
      withdrawal: { enabled: false, percentage: 0, maximum_amount_minor: null },
      funding_to_earning: { enabled: true, percentage: 5, maximum_amount_minor: null },
      earning_to_funding: { enabled: true, percentage: 5, maximum_amount_minor: null },
    });
    const free = await transfer(owner.id, "funding", 500n);
    expect(free.feeMinor).toBe("0");
    const treasuryBeforeFree = await treasuryBalance();
    await compensate(owner.id, free.id);
    expect(await treasuryBalance()).toBe(treasuryBeforeFree);
    const zeroFeeLedger = await app.database.query(
      `select 1 from treasury_capability.entries where source_kind='wallet_transfer_compensation'
         and source_id=(select uuid from wallet_capability.transfer_compensations where transfer_id=(select id from wallet_capability.transfers where uuid=$1))`,
      [free.id],
    );
    expect(zeroFeeLedger.rowCount).toBe(0);
  });

  it("rejects spent or partially available destinations, debt, reservations, and Treasury shortfall without effects", async () => {
    const owner = await account();
    await fund(owner.id, 10_000n);
    const spent = await transfer(owner.id, "funding", 1_000n);
    await insertEarningsSpendFixture(owner.id, 950n, "Spend transferred Earnings fixture");
    const balancesAfterSpend = [
      (await app.wallet.summary(owner.id)).available.minorAmount,
      await app.fundsReservation.available(owner.id, "USD"),
      await treasuryBalance(),
    ];
    await expect(compensate(owner.id, spent.id)).rejects.toMatchObject({
      code: "transfer_compensation_insufficient_destination",
      status: 409,
    });
    expect([
      (await app.wallet.summary(owner.id)).available.minorAmount,
      await app.fundsReservation.available(owner.id, "USD"),
      await treasuryBalance(),
    ]).toEqual(balancesAfterSpend);

    const partial = await transfer(owner.id, "funding", 1_000n);
    await insertEarningsSpendFixture(
      owner.id,
      500n,
      "Partially spend transferred Earnings fixture",
    );
    await expect(compensate(owner.id, partial.id)).rejects.toMatchObject({
      code: "transfer_compensation_insufficient_destination",
      status: 409,
    });

    const indebted = await transfer(owner.id, "funding", 1_000n);
    await app.accountDebt.increase({
      accountId: owner.id,
      amountMinor: 10n,
      wallet: "account",
      sourceKind: "compensation-test",
      sourceId: newId(),
      reason: "Existing debt blocks compensation",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: "compensation-existing-debt",
    });
    await expect(compensate(owner.id, indebted.id)).rejects.toMatchObject({
      code: "account_debt_blocks_operation",
      status: 409,
    });
  });

  it("does not reclaim Earnings held by a withdrawal reservation", async () => {
    const owner = await account();
    await fund(owner.id, 5_000n);
    const original = await transfer(owner.id, "funding", 1_000n);
    const destination = await app.withdrawalDestinations.create(owner.id, {
      method: "bank_ng",
      name: "Compensation reservation destination",
      values: { bank_name: "Test Bank", account_number: "0123456789", account_name: "Owner" },
    });
    await app.withdrawals.create({
      accountId: owner.id,
      amountMinor: 500n,
      currency: "USD",
      destinationId: destination.id,
      idempotencyKey: "compensation-reserved-earnings",
      correlationId: newId(),
    });
    await expect(compensate(owner.id, original.id)).rejects.toMatchObject({
      code: "transfer_compensation_insufficient_destination",
      status: 409,
    });
    expect(await app.fundsReservation.available(owner.id, "USD")).toBe(450n);
    expect(
      await app.database.query(`select 1 from wallet_capability.transfer_compensations`),
    ).toMatchObject({ rowCount: 0 });
  });

  it("rejects fee reimbursement below Treasury balance and leaves all movements untouched", async () => {
    const owner = await account();
    await fund(owner.id, 3_000n);
    const original = await transfer(owner.id, "funding", 1_000n);
    await app.treasury.createAdjustment({
      amountMinor: -50n,
      reason: "Treasury expenditure before transfer correction",
      actorId: owner.id,
      idempotencyKey: "compensation-treasury-spend",
    });
    const before = [
      (await app.wallet.summary(owner.id)).available.minorAmount,
      await app.fundsReservation.available(owner.id, "USD"),
      await treasuryBalance(),
    ];
    await expect(compensate(owner.id, original.id)).rejects.toMatchObject({
      code: "transfer_compensation_treasury_shortfall",
      status: 409,
    });
    expect([
      (await app.wallet.summary(owner.id)).available.minorAmount,
      await app.fundsReservation.available(owner.id, "USD"),
      await treasuryBalance(),
    ]).toEqual(before);
  });

  it("serializes concurrent compensation and compensation against a transfer spend", async () => {
    const owner = await account();
    await fund(owner.id, 5_000n);
    const original = await transfer(owner.id, "funding", 1_000n);
    const concurrent = await Promise.allSettled([
      compensate(owner.id, original.id, "comp-race-a"),
      compensate(owner.id, original.id, "comp-race-b"),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      await app.database.query(
        `select 1 from wallet_capability.transfer_compensations where transfer_id=(select id from wallet_capability.transfers where uuid=$1)`,
        [original.id],
      ),
    ).toMatchObject({ rowCount: 1 });

    const racing = await transfer(owner.id, "funding", 1_000n);
    const outcomes = await Promise.allSettled([
      compensate(owner.id, racing.id, "comp-vs-spend"),
      app.walletTransfers.transfer({
        accountId: owner.id,
        from: "earnings",
        to: "funding",
        grossMinor: 900n,
        idempotencyKey: "comp-vs-spend-transfer",
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await app.fundsReservation.available(owner.id, "USD")) >= 0n).toBe(true);
    expect((await app.wallet.summary(owner.id)).available.minorAmount >= 0n).toBe(true);
  });

  it("serializes compensation against withdrawal reservation", async () => {
    const owner = await account();
    await fund(owner.id, 5_000n);
    const original = await transfer(owner.id, "funding", 1_000n);
    const destination = await app.withdrawalDestinations.create(owner.id, {
      method: "bank_ng",
      name: "Compensation race destination",
      values: { bank_name: "Test Bank", account_number: "0123456789", account_name: "Owner" },
    });
    const outcomes = await Promise.allSettled([
      compensate(owner.id, original.id, "comp-vs-withdrawal"),
      app.withdrawals.create({
        accountId: owner.id,
        amountMinor: 900n,
        currency: "USD",
        destinationId: destination.id,
        idempotencyKey: "comp-vs-withdrawal-request",
        correlationId: newId(),
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await app.fundsReservation.available(owner.id, "USD")) >= 0n).toBe(true);
  });

  it("rolls back the compensation when the Treasury correction fails", async () => {
    const owner = await account();
    await fund(owner.id, 3_000n);
    const original = await transfer(owner.id, "funding", 1_000n);
    await app.database.query(`
      create or replace function public.reject_test_transfer_compensation_treasury()
      returns trigger language plpgsql as $$ begin
        if new.source_kind='wallet_transfer_compensation' then
          raise exception 'simulated compensation treasury failure';
        end if;
        return new;
      end $$;
      drop trigger if exists reject_test_transfer_compensation_treasury on treasury_capability.entries;
      create trigger reject_test_transfer_compensation_treasury before insert on treasury_capability.entries
      for each row execute function public.reject_test_transfer_compensation_treasury();
    `);
    const before = [
      (await app.wallet.summary(owner.id)).available.minorAmount,
      await app.fundsReservation.available(owner.id, "USD"),
      await treasuryBalance(),
    ];
    try {
      await expect(compensate(owner.id, original.id, "compensation-rollback")).rejects.toThrow(
        "simulated compensation treasury failure",
      );
    } finally {
      await app.database.query(
        `drop trigger if exists reject_test_transfer_compensation_treasury on treasury_capability.entries`,
      );
      await app.database.query(
        `drop function if exists public.reject_test_transfer_compensation_treasury()`,
      );
    }
    expect([
      (await app.wallet.summary(owner.id)).available.minorAmount,
      await app.fundsReservation.available(owner.id, "USD"),
      await treasuryBalance(),
    ]).toEqual(before);
    expect(
      await app.walletTransferCompensations.list({ accountId: owner.id, limit: 10 }),
    ).toMatchObject({ items: [] });
  });

  it("keeps compensation and Treasury evidence attached when root deletion targets the original transfer", async () => {
    const owner = await account();
    await fund(owner.id, 3_000n);
    const original = await transfer(owner.id, "funding", 1_000n);
    const compensation = await compensate(owner.id, original.id, "root-delete-protection");
    await expect(
      app.database.transaction(async () => {
        await app.database.query("select set_config('cliqero.root_delete','on',true)");
        await app.database.query(`delete from wallet_capability.transfers where uuid=$1`, [
          original.id,
        ]);
      }),
    ).rejects.toThrow();
    expect(await app.walletTransferCompensations.get(compensation.id)).not.toBeNull();
    expect(
      await app.database.query(
        `select 1 from treasury_capability.entries where source_kind='wallet_transfer_compensation' and source_id=$1`,
        [compensation.id],
      ),
    ).toMatchObject({ rowCount: 1 });
  });
});
