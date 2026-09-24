import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("withdrawal lifecycle", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(async () => {
    await app.database.query(
      `truncate table withdrawal_capability.withdrawals,withdrawal_capability.destinations,ledger_capability.withdrawal_reservation_events,ledger_capability.withdrawal_reservations,ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.purchase_distributions,payment_capability.reconciliation_attempts,payment_capability.provider_events,access_capability.access_grants,entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,identity_capability.account_capabilities,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`,
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
    const listing = await app.listingService.createPublished(seller, {
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
    const first = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 8000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "w-1",
      correlationId: newId(),
    });
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 3000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "w-2",
        correlationId: newId(),
      }),
    ).rejects.toThrow("Insufficient available funds");
    await expect(
      app.withdrawals.request({
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
  it("paginates account history by stable keyset without overlap and remains account-scoped", async () => {
    const { seller, buyer, destinationId } = await setup();
    for (let index = 0; index < 3; index += 1) {
      await app.withdrawals.request({
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
    const first = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "snapshot-key",
      correlationId: newId(),
    });
    const firstAccount = first.destination.fields.find((field) => field.name === "account_number");
    expect(firstAccount?.value).toBe("0123456789");
    await expect(
      app.database.query(
        `update withdrawal_capability.withdrawals set destination_name='mutated' where uuid=$1`,
        [first.id],
      ),
    ).rejects.toThrow("snapshots are immutable");

    await app.withdrawalDestinations.update(seller.id, destinationId, {
      values: { bank_name: "Changed bank", account_number: "9999999999", account_name: "Changed" },
    });
    const retry = await app.withdrawals.request({
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

    const second = await app.withdrawals.request({
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
    ).rejects.toThrow("archived");
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "snapshot-key",
        correlationId: newId(),
      }),
    ).resolves.toMatchObject({ id: first.id });
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "archived-new-request",
        correlationId: newId(),
      }),
    ).rejects.toThrow("archived");
    expect(
      (await app.withdrawalRepository.findById(first.id))?.destination.fields.find(
        (field) => field.name === "account_number",
      )?.value,
    ).toBe("0123456789");
  });
  it("rejects semantic idempotency-key reuse for a different withdrawal", async () => {
    const { seller, destinationId } = await setup();
    const first = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "semantic-key",
      correlationId: newId(),
    });
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 2000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "semantic-key",
        correlationId: newId(),
      }),
    ).rejects.toThrow("already used for another request");
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationId: newId(),
        idempotencyKey: "semantic-key",
        correlationId: newId(),
      }),
    ).rejects.toThrow("already used for another request");
    expect(
      (await app.withdrawalRepository.listForAccount(seller.id, { limit: 50 })).items.filter(
        (item) => item.id === first.id,
      ),
    ).toHaveLength(1);
  });
  it("converges concurrent identical requests on one withdrawal", async () => {
    const { seller, destinationId } = await setup();
    const idempotencyKey = "concurrent-same-key";
    const results = await Promise.all([
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 4000n,
        currency: "USD",
        destinationId,
        idempotencyKey,
        correlationId: newId(),
      }),
      app.withdrawals.request({
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
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 8000n,
        currency: "USD",
        destinationId,
        idempotencyKey: "wa",
        correlationId: newId(),
      }),
      app.withdrawals.request({
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
    await app.withdrawals.reject(seller.id, withdrawal.id, "manual rejection");
    await app.withdrawals.reject(seller.id, withdrawal.id, "duplicate").catch(() => undefined);
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(0n);
    const completed = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 5000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "wc",
      correlationId: newId(),
    });
    await app.withdrawals.approve(seller.id, completed.id);
    await app.withdrawals.complete(seller.id, completed.id, {
      externalReference: "manual-transfer-001",
      note: "Paid after manual bank review",
    });
    await expect(app.withdrawals.complete(seller.id, completed.id)).rejects.toThrow(
      "Invalid withdrawal transition from completed",
    );
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
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 5001n,
        currency: "USD",
        destinationId,
        idempotencyKey: "after-completion",
        correlationId: newId(),
      }),
    ).rejects.toThrow("Insufficient available funds");
  });
  it("cancels a requested withdrawal and releases its reservation", async () => {
    const { seller, destinationId } = await setup();
    const withdrawal = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "cancel-request",
      correlationId: newId(),
    });

    await expect(app.withdrawals.cancel(seller.id, withdrawal.id)).resolves.toMatchObject({
      state: "cancelled",
    });
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(0n);
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
  it("does not allow cancellation after approval and keeps ownership immutable", async () => {
    const { seller, destinationId } = await setup();
    const withdrawal = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationId,
      idempotencyKey: "wx",
      correlationId: newId(),
    });
    await app.withdrawals.approve(seller.id, withdrawal.id);
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
});
