import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { feePolicyFromYaml } from "@/modules/fee/policy";
const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const enabledFees = feePolicyFromYaml({
  enabled: true,
  withdrawal: { enabled: true, percentage: 5, maximum_amount_minor: 2000 },
  funding_to_earning: { enabled: true, percentage: 2, maximum_amount_minor: 1000 },
  earning_to_funding: { enabled: true, percentage: 1, maximum_amount_minor: 500 },
});
let activeFees = enabledFees;
suite("withdrawal lifecycle", () => {
  const app = createContainer(databaseUrl!, { feePolicySource: { getActive: () => activeFees } });
  beforeEach(async () => {
    activeFees = enabledFees;
    await app.database.query(
      `truncate table treasury_capability.entries,withdrawal_capability.withdrawals,withdrawal_capability.destinations,ledger_capability.withdrawal_reservation_events,ledger_capability.withdrawal_reservations,ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.purchase_distributions,payment_capability.reconciliation_attempts,payment_capability.provider_events,access_capability.access_grants,entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,identity_capability.account_capabilities,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`,
    );
    await app.database.query(
      `update ledger_capability.distribution_policy set initial_balance_state='available',settlement_delay_seconds=0,platform_rate_basis_points=0`,
    );
    await app.database.query(
      `update referral_capability.commission_policy set rates_basis_points='{}'`,
    );
  });
  afterAll(() => app.database.close());
  async function setup() {
    const seller = await app.authentication.register({
      email: `seller-${newId().slice(0, 5)}@example.com`,
      username: `sell${newId().slice(0, 8)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    const buyer = await app.authentication.register({
      email: `buyer-${newId().slice(0, 5)}@example.com`,
      username: `buy${newId().slice(0, 8)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    const listing = await app.listingService.create(seller, {
      state: "published",
      title: "Withdrawable",
      shortDescription: "Fund a withdrawal flow",
      longDescription: "Detailed withdrawal listing.",
      priceMinor: "10000",
      currency: "USD",
      destination: "https://example.test",
    });
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: newId(),
    });
    await app.legacyPaymentCompletion.complete({
      paymentId: checkout.paymentId,
      correlationId: newId(),
    });
    await app.purchaseDistribution.process({
      purchaseId: checkout.purchaseId!,
      correlationId: newId(),
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability) values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [seller.id],
    );
    const savedDestination = await app.withdrawalDestinations.create(seller.id, {
      method: "bank_ng",
      name: "Test account",
      values: { bank_name: "Test bank", account_number: "0123456789", account_name: "Seller" },
    });
    return { seller, buyer, destinationId: savedDestination.id };
  }
  it("reserves available funds atomically and blocks pending funds", async () => {
    const { seller, destinationId } = await setup();
    const first = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 8000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "w-1",
      correlationId: newId(),
    });
    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 3000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "w-2",
        correlationId: newId(),
      }),
    ).rejects.toThrow("Insufficient available earnings.");
    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 8000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "w-1",
        correlationId: newId(),
      }),
    ).resolves.toMatchObject({ id: first.id });
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(8000n);
  });

  it("snapshots an explicit zero fee and posts no Treasury income when fees are globally disabled", async () => {
    const { seller, destinationId } = await setup();
    activeFees = feePolicyFromYaml({
      enabled: false,
      withdrawal: { enabled: true, percentage: 5, maximum_amount_minor: 2000 },
      funding_to_earning: { enabled: true, percentage: 2, maximum_amount_minor: 1000 },
      earning_to_funding: { enabled: true, percentage: 1, maximum_amount_minor: 500 },
    });
    const treasuryBefore = (await app.treasuryRepository.summary()).balanceMinor;
    const withdrawal = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 5_000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "global-fees-disabled",
      correlationId: newId(),
    });
    expect(withdrawal).toMatchObject({
      fee: { minorAmount: 0n },
      netAmount: { minorAmount: 5_000n },
    });
    activeFees = enabledFees;
    await app.withdrawals.update(seller.id, withdrawal.id, { state: "approved" });
    await app.withdrawals.complete(seller.id, withdrawal.id);
    expect(await app.withdrawalRepository.findById(withdrawal.id)).toMatchObject({
      fee: { minorAmount: 0n },
      netAmount: { minorAmount: 5_000n },
      state: "completed",
    });
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(treasuryBefore);
    const feeRows = await app.database.query<{ count: string }>(
      `select count(*)::text count from treasury_capability.entries where idempotency_key=$1`,
      [`withdrawal:${withdrawal.id}:fee`],
    );
    expect(feeRows.rows[0]?.count).toBe("0");
  });
  it("rejects forged over-balance amounts without partially committing withdrawal work", async () => {
    const { seller, destinationId } = await setup();
    const treasuryBefore = (await app.treasuryRepository.summary()).balanceMinor;

    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 10001n,
        currency: "USD",
        destinationId,
        idempotencyKey: "forged-over-balance",
        correlationId: newId(),
      }),
    ).rejects.toThrow("Insufficient available earnings.");

    const withdrawalCount = await app.database.query<{ count: string }>(
      `select count(*)::text as count from withdrawal_capability.withdrawals where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [seller.id],
    );
    const reservationCount = await app.database.query<{ count: string }>(
      `select count(*)::text as count from ledger_capability.withdrawal_reservations where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [seller.id],
    );
    const outboxCount = await app.database.query<{ count: string }>(
      `select count(*)::text as count from kernel.outbox_events where event_name='withdrawal.requested' and payload->>'accountId'=$1`,
      [seller.id],
    );
    const treasuryRows = await app.database.query<{ count: string }>(
      `select count(*)::text as count from treasury_capability.entries where idempotency_key like 'withdrawal:%:fee:%'`,
    );
    expect(withdrawalCount.rows[0]?.count).toBe("0");
    expect(reservationCount.rows[0]?.count).toBe("0");
    expect(outboxCount.rows[0]?.count).toBe("0");
    expect(treasuryRows.rows[0]?.count).toBe("0");
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(treasuryBefore);
  });
  it("rejects another account's destination and scopes idempotency keys per account", async () => {
    const first = await setup();
    const second = await setup();

    await expect(
      app.withdrawals.create({
        accountId: second.seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId: first.destinationId,
        idempotencyKey: "foreign-destination",
        correlationId: newId(),
      }),
    ).rejects.toThrow("Payout destination not found for this account.");

    const firstWithdrawal = await app.withdrawals.create({
      accountId: first.seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId: first.destinationId,
      idempotencyKey: "same-key-different-accounts",
      correlationId: newId(),
    });
    const secondWithdrawal = await app.withdrawals.create({
      accountId: second.seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId: second.destinationId,
      idempotencyKey: "same-key-different-accounts",
      correlationId: newId(),
    });

    expect(firstWithdrawal.id).not.toBe(secondWithdrawal.id);
    expect(firstWithdrawal.accountId).toBe(first.seller.id);
    expect(secondWithdrawal.accountId).toBe(second.seller.id);
  });
  it("paginates account history by stable keyset without overlap and remains account-scoped", async () => {
    const { seller, buyer, destinationId } = await setup();
    for (let index = 0; index < 3; index += 1) {
      await app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 100n,
        currency: "USD",
        destinationId,
        idempotencyKey: `history-page-${index}`,
        correlationId: newId(),
      });
    }
    const first = await app.withdrawalRepository.listForAccount(seller.id, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await app.withdrawalRepository.listForAccount(seller.id, {
      cursor: first.nextCursor!,
      limit: 2,
    });
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(second.items).toHaveLength(1);
    expect(new Set(ids).size).toBe(3);
    expect(second.nextCursor).toBeNull();
    expect(
      (await app.withdrawalRepository.listForAccount(buyer.id, { limit: 10 })).items,
    ).toHaveLength(0);
  });
  it("snapshots destination facts and leaves idempotent retries bound to the original destination ID", async () => {
    const { seller, destinationId } = await setup();
    const first = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "snapshot-key",
      correlationId: newId(),
    });
    const firstAccount = first.destination.fields.find((field) => field.name === "account_number");
    expect(firstAccount?.value).toBe("0123456789");
    await app.withdrawals.update(seller.id, first.id, { state: "approved" });
    await expect(
      app.database.query(
        `update withdrawal_capability.withdrawals set destination_name='mutated' where uuid=$1`,
        [first.id],
      ),
    ).rejects.toThrow("snapshots are immutable");

    await app.withdrawalDestinations.update(seller.id, destinationId, {
      values: { bank_name: "Changed bank", account_number: "9999999999", account_name: "Changed" },
    });
    const retry = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "snapshot-key",
      correlationId: newId(),
    });
    expect(retry.destination.fields.find((field) => field.name === "account_number")?.value).toBe(
      "0123456789",
    );

    const second = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "snapshot-key-2",
      correlationId: newId(),
    });
    expect(second.destination.fields.find((field) => field.name === "account_number")?.value).toBe(
      "9999999999",
    );
    await app.withdrawalDestinations.update(seller.id, destinationId, { status: "archived" });
    await expect(
      app.withdrawalDestinations.resolveForWithdrawal(seller.id, destinationId),
    ).rejects.toThrow("This payout destination is unavailable.");
    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "snapshot-key",
        correlationId: newId(),
      }),
    ).resolves.toMatchObject({ id: first.id });
    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "archived-new-request",
        correlationId: newId(),
      }),
    ).rejects.toThrow("This payout destination is unavailable.");
    expect(
      (await app.withdrawalRepository.findById(first.id))?.destination.fields.find(
        (field) => field.name === "account_number",
      )?.value,
    ).toBe("0123456789");
  });
  it("rejects semantic idempotency-key reuse for a different withdrawal", async () => {
    const { seller, destinationId } = await setup();
    const first = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "semantic-key",
      correlationId: newId(),
    });
    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 2000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "semantic-key",
        correlationId: newId(),
      }),
    ).rejects.toThrow("This idempotency key is already used for a different withdrawal.");
    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId: newId(),
        idempotencyKey: "semantic-key",
        correlationId: newId(),
      }),
    ).rejects.toThrow("This idempotency key is already used for a different withdrawal.");
    expect(
      (await app.withdrawalRepository.listForAccount(seller.id, { limit: 50 })).items.filter(
        (item) => item.id === first.id,
      ),
    ).toHaveLength(1);
  });

  it("binds idempotency to original state and normalized initial reason after later updates", async () => {
    const { seller, destinationId } = await setup();
    const created = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "creation-intent-key",
      correlationId: newId(),
      initialReason: "  customer request  ",
    });
    await app.withdrawals.update(seller.id, created.id, {
      state: "approved",
      reason: "reviewed by operator",
    });

    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "creation-intent-key",
        correlationId: newId(),
        initialReason: "customer request",
      }),
    ).resolves.toMatchObject({ id: created.id, state: "approved" });

    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "creation-intent-key",
        correlationId: newId(),
        initialReason: "other intent",
      }),
    ).rejects.toThrow("This idempotency key is already used for a different withdrawal.");
    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "creation-intent-key",
        correlationId: newId(),
        initialState: "approved",
        initialReason: "customer request",
      }),
    ).rejects.toThrow("This idempotency key is already used for a different withdrawal.");
    const snapshot = await app.database.query<{
      creation_state: string;
      creation_reason: string | null;
    }>(
      `select creation_state,creation_reason from withdrawal_capability.withdrawals where uuid=$1`,
      [created.id],
    );
    expect(snapshot.rows[0]).toEqual({
      creation_state: "requested",
      creation_reason: "customer request",
    });
  });
  it("converges concurrent identical requests on one withdrawal", async () => {
    const { seller, destinationId } = await setup();
    const idempotencyKey = "concurrent-same-key";
    const results = await Promise.all([
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 4000n,
        currency: "USD",
        destinationId,
        idempotencyKey,
        correlationId: newId(),
      }),
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 4000n,
        currency: "USD",
        destinationId,
        idempotencyKey,
        correlationId: newId(),
      }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await app.withdrawalRepository.listForAccount(seller.id, { limit: 50 })).items.filter(
        (item) => item.id === results[0].id,
      ),
    ).toHaveLength(1);
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(4000n);
  });
  it("prevents concurrent overspending and supports reject/release and manual completion", async () => {
    const { seller, destinationId } = await setup();
    const results = await Promise.allSettled([
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 8000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "wa",
        correlationId: newId(),
      }),
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 8000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "wb",
        correlationId: newId(),
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const withdrawal = (
      results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>
    ).value;
    const treasuryBeforeUnpaidOutcomes = (await app.treasuryRepository.summary()).balanceMinor;
    await app.withdrawals.update(seller.id, withdrawal.id, {
      state: "rejected",
      reason: "manual rejection",
    });
    await app.withdrawals
      .update(seller.id, withdrawal.id, { state: "rejected", reason: "duplicate" })
      .catch(() => undefined);
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(0n);
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(
      treasuryBeforeUnpaidOutcomes - (withdrawal.fee?.minorAmount ?? 0n),
    );
    const completed = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 5000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "wc",
      correlationId: newId(),
    });
    await app.withdrawals.update(seller.id, completed.id, { state: "approved" });
    await app.withdrawals.complete(seller.id, completed.id, {
      externalReference: "manual-transfer-001",
      note: "Paid after manual bank review",
    });
    const feeAfterCompletion = (await app.treasuryRepository.summary()).balanceMinor;
    expect(feeAfterCompletion).toBe(
      treasuryBeforeUnpaidOutcomes -
        (withdrawal.fee?.minorAmount ?? 0n) +
        (completed.fee?.minorAmount ?? 0n),
    );
    await expect(app.withdrawals.complete(seller.id, completed.id)).rejects.toThrow(
      "Only approved withdrawals can be completed; this one is completed.",
    );
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(feeAfterCompletion);
    const feeRows = await app.database.query<{ count: string; amount: string }>(
      `select count(*)::text count,coalesce(sum(amount_minor),0)::text amount from treasury_capability.entries where idempotency_key=$1`,
      [`withdrawal:${completed.id}:fee:request:${completed.fee?.minorAmount ?? 0n}`],
    );
    expect(feeRows.rows[0]).toEqual({
      count: "1",
      amount: String(completed.fee?.minorAmount ?? 0n),
    });
    const reversalRows = await app.database.query<{ count: string }>(
      `select count(*)::text count from treasury_capability.entries where idempotency_key like $1`,
      [`withdrawal:${withdrawal.id}:fee:reversal:%`],
    );
    expect(reversalRows.rows[0]?.count).toBe("1");
    expect(await app.withdrawalRepository.findById(completed.id)).toMatchObject({
      state: "completed",
      externalReference: "manual-transfer-001",
      completionNote: "Paid after manual bank review",
      completedBy: seller.id,
      completedAt: expect.any(Date),
    });
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(0n);
    expect((await app.fundsReservation.summarize(seller.id))[0].completedMinor).toBe(5000n);
    await expect(
      app.withdrawals.create({
        accountId: seller.id,
        amountMinor: 5001n,
        currency: "USD",
        destinationId,
        idempotencyKey: "after-completion",
        correlationId: newId(),
      }),
    ).rejects.toThrow("Insufficient available earnings.");
  });
  it("cancels a requested withdrawal and releases its reservation", async () => {
    const { seller, destinationId } = await setup();
    const withdrawal = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "cancel-request",
      correlationId: newId(),
    });
    const treasuryBeforeCancel = (await app.treasuryRepository.summary()).balanceMinor;

    await expect(app.withdrawals.cancel(seller.id, withdrawal.id)).resolves.toMatchObject({
      state: "cancelled",
    });
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(0n);
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(
      treasuryBeforeCancel - (withdrawal.fee?.minorAmount ?? 0n),
    );
    const events = await app.database.query<{ kind: string }>(
      `select kind
         from ledger_capability.withdrawal_reservation_events
        where reservation_id=(
          select id from ledger_capability.withdrawal_reservations
           where withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1)
        )
        order by created_at desc,id desc`,
      [withdrawal.id],
    );
    expect(events.rows[0]?.kind).toBe("released");
  });
  it("creates, edits, transitions, and deletes mutable operator withdrawals atomically", async () => {
    const { seller, destinationId } = await setup();
    const initialAvailable = await app.fundsReservation.available(seller.id, "USD");
    const secondDestination = await app.withdrawalDestinations.create(seller.id, {
      method: "bank_ng",
      name: "Replacement account",
      values: {
        bank_name: "Replacement bank",
        account_number: "9988776655",
        account_name: "Seller",
      },
    });

    const created = await app.withdrawals.requestByOperator(seller.id, {
      accountId: seller.id,
      amountMinor: "5000",
      destinationId,
      idempotencyKey: newId(),
    });
    expect(created).toMatchObject({ state: "requested", amount: { minorAmount: 5000n } });
    const initialFee = created.fee!.minorAmount;
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(initialAvailable - 5000n);

    const edited = await app.withdrawals.update(seller.id, created.id, {
      amountMinor: "4000",
      destinationId: secondDestination.id,
      state: "requested",
      reason: "Corrected request details",
    });
    expect(edited).toMatchObject({
      amount: { minorAmount: 4000n },
      destination: { savedDestinationId: secondDestination.id },
      reason: "Corrected request details",
    });
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(initialAvailable - 4000n);
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(4000n);
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(edited.fee!.minorAmount);
    expect(edited.fee!.minorAmount).not.toBe(initialFee);

    const approved = await app.withdrawals.update(seller.id, created.id, {
      amountMinor: "4000",
      destinationId: secondDestination.id,
      state: "approved",
      reason: "Approved after review",
    });
    expect(approved.state).toBe("approved");
    await expect(
      app.withdrawals.update(seller.id, created.id, {
        amountMinor: "3000",
        destinationId: secondDestination.id,
        state: "requested",
        reason: "",
      }),
    ).rejects.toThrow("Amount and destination are locked after approval");
    await expect(app.withdrawals.delete(seller.id, created.id)).resolves.toEqual({
      id: created.id,
      deleted: true,
    });
    expect(await app.withdrawalRepository.findById(created.id)).toBeNull();
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(initialAvailable);

    const deletable = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 2000n,
      currency: "USD",
      destinationId,
      idempotencyKey: newId(),
      correlationId: newId(),
    });
    const treasuryBeforeDelete = (await app.treasuryRepository.summary()).balanceMinor;
    await app.withdrawals.delete(seller.id, deletable.id);
    expect(await app.withdrawalRepository.findById(deletable.id)).toBeNull();
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(initialAvailable);
    const reservation = await app.database.query<{ count: string }>(
      `select count(*)::text count from ledger_capability.withdrawal_reservations
        where withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1)`,
      [deletable.id],
    );
    expect(reservation.rows[0]?.count).toBe("0");
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(
      treasuryBeforeDelete - (deletable.fee?.minorAmount ?? 0n),
    );

    const completed = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: newId(),
      correlationId: newId(),
    });
    await app.withdrawals.update(seller.id, completed.id, { state: "approved" });
    await app.withdrawals.complete(seller.id, completed.id, { externalReference: "payout-proof" });
    await expect(app.withdrawals.delete(seller.id, completed.id)).resolves.toEqual({
      id: completed.id,
      deleted: true,
    });
    expect(await app.withdrawalRepository.findById(completed.id)).toBeNull();
    expect(
      await app.database.query(
        `select previous_state->>'state' state,previous_state->>'amountMinor' amount_minor,
                new_state->>'mode' mode
           from kernel.audit_records
          where action='root.delete' and subject_type='withdrawal' and subject_id=$1`,
        [completed.id],
      ),
    ).toMatchObject({
      rows: [{ state: "completed", amount_minor: "1000", mode: "physical" }],
    });
  });
  it("reflects reserved, released, and completed amounts in withdrawable earnings", async () => {
    const { seller, destinationId } = await setup();
    const initial = await app.fundsReservation.available(seller.id, "USD");

    const released = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1100n,
      currency: "USD",
      destinationId,
      idempotencyKey: "availability-release",
      correlationId: newId(),
    });
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(initial - 1100n);
    await app.withdrawals.update(seller.id, released.id, {
      state: "rejected",
      reason: "release reservation",
    });
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(initial);

    const completed = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1100n,
      currency: "USD",
      destinationId,
      idempotencyKey: "availability-complete",
      correlationId: newId(),
    });
    await app.withdrawals.update(seller.id, completed.id, { state: "approved" });
    await app.withdrawals.complete(seller.id, completed.id);
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(initial - 1100n);
  });
  it("does not allow cancellation after approval and keeps ownership immutable", async () => {
    const { seller, destinationId } = await setup();
    const withdrawal = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "wx",
      correlationId: newId(),
    });
    await app.withdrawals.update(seller.id, withdrawal.id, { state: "approved" });
    await expect(app.withdrawals.cancel(seller.id, withdrawal.id)).rejects.toThrow(
      "cannot be cancelled",
    );
    await expect(
      app.withdrawals.get(
        (
          await app.authentication.register({
            email: `other-${newId().slice(0, 5)}@example.com`,
            username: `oth${newId().slice(0, 8)}`,
            password: "correct-horse-battery",
            country: "NG",
          })
        ).id,
        withdrawal.id,
      ),
    ).rejects.toThrow("not found");
  });
  it("restores returned payout value, settles debt first, reverses the Treasury fee, and replays idempotently", async () => {
    const { seller, destinationId } = await setup();
    const withdrawal = await app.withdrawals.create({
      accountId: seller.id,
      amountMinor: 5000n,
      currency: "USD",
      destinationId,
      idempotencyKey: `return-withdrawal-${newId()}`,
      correlationId: newId(),
    });
    await app.withdrawals.update(seller.id, withdrawal.id, { state: "approved" });
    await app.withdrawals.complete(seller.id, withdrawal.id, { externalReference: "payout-777" });
    await app.accountDebt.increase({
      accountId: seller.id,
      amountMinor: 1000n,
      wallet: "earnings",
      sourceKind: "reversal_test",
      sourceId: withdrawal.id,
      reason: "Existing debt must be settled before returned payout is spendable",
      actor: { kind: "system", id: "integration-test" },
      correlationId: withdrawal.correlationId,
      idempotencyKey: `debt-before-return-${newId()}`,
    });
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(5000n);
    const input = {
      amountMinor: "4750",
      reason: "Destination bank returned the payout",
      externalReference: "bank-return-777",
      idempotencyKey: `payout-return-${newId()}`,
    };
    const first = await app.withdrawals.recordPayoutReturn(seller.id, withdrawal.id, input);
    const replay = await app.withdrawals.recordPayoutReturn(seller.id, withdrawal.id, input);
    expect(first.changed).toBe(true);
    expect(replay.changed).toBe(false);
    expect(first.payoutReturn).toMatchObject({ amountMinor: 4750n, restoredMinor: 5000n });
    expect(await app.fundsReservation.available(seller.id, "USD")).toBe(9000n);
    expect(await app.accountDebt.balance(seller.id, seller.id)).toBe("0");
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(0n);
    expect(await app.withdrawalRepository.findById(withdrawal.id)).toMatchObject({
      state: "failed",
    });
    expect(
      (await app.operatorWithdrawals.list({ limit: 10 })).items.find(
        (item) => item.id === withdrawal.id,
      ),
    ).toMatchObject({
      payoutReturn: {
        amountMinor: "4750",
        restoredMinor: "5000",
        externalReference: "bank-return-777",
        actorId: seller.id,
      },
    });
    const event = await app.database.query<{ kind: string }>(
      `select kind from ledger_capability.withdrawal_reservation_events
        where withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1)
        order by created_at desc,id desc limit 1`,
      [withdrawal.id],
    );
    expect(event.rows[0]?.kind).toBe("returned");
  });
});
