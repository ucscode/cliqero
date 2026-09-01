import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("withdrawal lifecycle", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(async () => {
    await app.database.query(
      `truncate table withdrawal_capability.withdrawals,ledger_capability.withdrawal_reservation_events,ledger_capability.withdrawal_reservations,ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.purchase_distributions,payment_capability.reconciliation_attempts,payment_capability.provider_events,access_capability.access_grants,entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,identity_capability.account_capabilities,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`,
    );
    await app.database.query(
      `update ledger_capability.distribution_policy set initial_balance_state='available',settlement_delay_seconds=0,platform_rate_basis_points=0`,
    );
    await app.database.query(
      `update referral_capability.commission_policy set rates_basis_points='{}'`,
    );
    await app.database.query(
      `update withdrawal_capability.policy set minimum_amount_minor=1,maximum_amount_minor=null,currency='USD',enabled=true`,
    );
  });
  afterAll(() => app.database.close());
  async function setup() {
    const seller = await app.authentication.register({
      email: `seller-${newId().slice(0, 5)}@example.com`,
      handle: `sell${newId().slice(0, 8)}`,
      password: "correct-horse-battery",
    });
    const buyer = await app.authentication.register({
      email: `buyer-${newId().slice(0, 5)}@example.com`,
      handle: `buy${newId().slice(0, 8)}`,
      password: "correct-horse-battery",
    });
    const listing = await app.listingService.createPublished(seller, {
      title: "Withdrawable",
      description: "",
      priceMinor: "10000",
      currency: "USD",
      destination: "https://example.test",
    });
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
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
      `insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,
      [seller.id],
    );
    return { seller, buyer };
  }
  it("reserves available funds atomically and blocks pending funds", async () => {
    const { seller } = await setup();
    const first = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 8000n,
      currency: "USD",
      destinationType: "manual",
      destinationReference: "ops-ref",
      idempotencyKey: "w-1",
      correlationId: newId(),
    });
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 3000n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "ops-ref",
        idempotencyKey: "w-2",
        correlationId: newId(),
      }),
    ).rejects.toThrow("Insufficient available funds");
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 8000n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "ops-ref",
        idempotencyKey: "w-1",
        correlationId: newId(),
      }),
    ).resolves.toMatchObject({ id: first.id });
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(8000n);
  });
  it("rejects semantic idempotency-key reuse for a different withdrawal", async () => {
    const { seller } = await setup();
    const first = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationType: "manual",
      destinationReference: "same-key",
      idempotencyKey: "semantic-key",
      correlationId: newId(),
    });
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 2000n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "same-key",
        idempotencyKey: "semantic-key",
        correlationId: newId(),
      }),
    ).rejects.toThrow("already used for another request");
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 1000n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "different-destination",
        idempotencyKey: "semantic-key",
        correlationId: newId(),
      }),
    ).rejects.toThrow("already used for another request");
    expect(
      (await app.withdrawalRepository.listForAccount(seller.id)).filter(
        (item) => item.id === first.id,
      ),
    ).toHaveLength(1);
  });
  it("converges concurrent identical requests on one withdrawal", async () => {
    const { seller } = await setup();
    const idempotencyKey = "concurrent-same-key";
    const results = await Promise.all([
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 4000n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "same-destination",
        idempotencyKey,
        correlationId: newId(),
      }),
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 4000n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "same-destination",
        idempotencyKey,
        correlationId: newId(),
      }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await app.withdrawalRepository.listForAccount(seller.id)).filter(
        (item) => item.id === results[0].id,
      ),
    ).toHaveLength(1);
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(4000n);
  });
  it("prevents concurrent overspending and supports reject/release and manual completion", async () => {
    const { seller } = await setup();
    const results = await Promise.allSettled([
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 8000n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "a",
        idempotencyKey: "wa",
        correlationId: newId(),
      }),
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 8000n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "b",
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
      destinationType: "manual",
      destinationReference: "c",
      idempotencyKey: "wc",
      correlationId: newId(),
    });
    await app.withdrawals.approve(seller.id, completed.id);
    await app.withdrawals.complete(seller.id, completed.id);
    await app.withdrawals.complete(seller.id, completed.id).catch(() => undefined);
    expect((await app.withdrawalRepository.findById(completed.id))?.state).toBe("completed");
    expect((await app.fundsReservation.summarize(seller.id))[0].reservedMinor).toBe(0n);
    expect((await app.fundsReservation.summarize(seller.id))[0].completedMinor).toBe(5000n);
    await expect(
      app.withdrawals.request({
        accountId: seller.id,
        amountMinor: 5001n,
        currency: "USD",
        destinationType: "manual",
        destinationReference: "after-completion",
        idempotencyKey: "after-completion",
        correlationId: newId(),
      }),
    ).rejects.toThrow("Insufficient available funds");
  });
  it("does not allow cancellation after approval and keeps ownership immutable", async () => {
    const { seller } = await setup();
    const withdrawal = await app.withdrawals.request({
      accountId: seller.id,
      amountMinor: 1000n,
      currency: "USD",
      destinationType: "manual",
      destinationReference: "private",
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
            handle: `oth${newId().slice(0, 8)}`,
            password: "correct-horse-battery",
          })
        ).id,
        withdrawal.id,
      ),
    ).rejects.toThrow("not found");
  });
});
