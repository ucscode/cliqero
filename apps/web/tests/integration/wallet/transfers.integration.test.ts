import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("atomic Funding and Earnings transfers", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(
      `truncate table wallet_capability.transfer_entries,wallet_capability.transfers,ledger_capability.earnings_adjustments,treasury_capability.entries,wallet_capability.debits,wallet_capability.credits,checkout_capability.checkouts,funding_capability.funding_transactions,ledger_capability.entries,ledger_capability.purchase_distributions,access_capability.access_grants,entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`,
    );
  });
  afterAll(() => app.database.close());

  async function account() {
    return app.authentication.register({
      email: `wallet-transfer-${newId()}@example.test`,
      username: `wt${newId().replaceAll("-", "").slice(0, 12)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
  }

  async function fund(accountId: string, amountMinor: bigint) {
    const funding = await app.fundingService.create({
      accountId,
      amountMinor,
      providerName: "development",
      idempotencyKey: `transfer-test-${newId()}`,
    });
    await app.fundingInitialization.process(funding.id);
    expect((await app.fundingVerification.process(funding.id))?.state).toBe("confirmed");
    await app.walletCredit.process(funding.id);
    await app.walletAvailability.runBatch();
  }

  it("posts both transfer directions with exact fees, shared correlation, idempotency, and rollback", async () => {
    const user = await account();
    await fund(user.id, 30_000n);
    const treasuryBefore = await app.treasuryRepository.summary();

    const toEarnings = await app.walletTransfers.transfer({
      accountId: user.id,
      from: "funding",
      to: "earnings",
      grossMinor: 10_000n,
      idempotencyKey: "funding-to-earnings-1",
    });
    expect(toEarnings).toMatchObject({ grossMinor: "10000", feeMinor: "200", netMinor: "9800" });
    expect((await app.wallet.summary(user.id)).available.minorAmount).toBe(20_000n);
    expect(await app.fundsReservation.available(user.id, "USD")).toBe(9_800n);
    expect(
      (await app.treasuryRepository.summary()).balanceMinor - treasuryBefore.balanceMinor,
    ).toBe(200n);
    const toEarningsRetry = await app.walletTransfers.transfer({
      accountId: user.id,
      from: "funding",
      to: "earnings",
      grossMinor: 10_000n,
      idempotencyKey: "funding-to-earnings-1",
    });
    expect(toEarningsRetry.id).toBe(toEarnings.id);
    expect((await app.wallet.summary(user.id)).available.minorAmount).toBe(20_000n);

    const toFunding = await app.walletTransfers.transfer({
      accountId: user.id,
      from: "earnings",
      to: "funding",
      grossMinor: 5_000n,
      idempotencyKey: "earnings-to-funding-1",
    });
    expect(toFunding).toMatchObject({ grossMinor: "5000", feeMinor: "50", netMinor: "4950" });
    expect((await app.wallet.summary(user.id)).available.minorAmount).toBe(24_950n);
    expect(await app.fundsReservation.available(user.id, "USD")).toBe(4_800n);
    expect(
      (await app.treasuryRepository.summary()).balanceMinor - treasuryBefore.balanceMinor,
    ).toBe(250n);

    const correlationRows = await app.database.query<{
      uuid: string;
      correlation_id: string;
      entry_correlation_id: string;
      adjustment_reference: string;
      treasury_source_id: string;
    }>(
      `select t.uuid::text, t.correlation_id::text, x.correlation_id::text entry_correlation_id,
              a.reference adjustment_reference, tr.source_id::text treasury_source_id
         from wallet_capability.transfers t
         join wallet_capability.transfer_entries x on x.transfer_id=t.id
         join ledger_capability.earnings_adjustments a on a.reference=t.uuid::text
         join treasury_capability.entries tr on tr.source_id=t.uuid and tr.source_kind='wallet_transfer'
        where t.uuid in ($1,$2)`,
      [toEarnings.id, toFunding.id],
    );
    expect(correlationRows.rows).toHaveLength(2);
    for (const row of correlationRows.rows) {
      expect(row.correlation_id).toBe(row.uuid);
      expect(row.entry_correlation_id).toBe(row.uuid);
      expect(row.adjustment_reference).toBe(row.uuid);
      expect(row.treasury_source_id).toBe(row.uuid);
    }

    await expect(
      app.walletTransfers.transfer({
        accountId: user.id,
        from: "earnings",
        to: "funding",
        grossMinor: 99_999n,
        idempotencyKey: "insufficient-transfer",
      }),
    ).rejects.toThrow("not enough available balance");

    await app.treasuryRepository.create({
      id: newId(),
      direction: "credit",
      amountMinor: 1n,
      title: "Rollback conflict seed",
      note: null,
      sourceKind: null,
      sourceId: null,
      idempotencyKey: "wallet-transfer:rollback-transfer:fee",
      actorId: user.id,
      createdAt: new Date(),
    });
    await expect(
      app.walletTransfers.transfer({
        accountId: user.id,
        from: "funding",
        to: "earnings",
        grossMinor: 1_000n,
        idempotencyKey: "rollback-transfer",
      }),
    ).rejects.toThrow();
    const rolledBack = await app.database.query<{ count: string }>(
      `select count(*)::text count from wallet_capability.transfers where account_id=(select id from identity_capability.accounts where uuid=$1) and idempotency_key='rollback-transfer'`,
      [user.id],
    );
    expect(rolledBack.rows[0]?.count).toBe("0");
  });
});
