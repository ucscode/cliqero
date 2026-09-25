import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer, type ApplicationContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import { CommercialWorkflowDispatcher } from "@/workers/commercial/dispatcher";
import { projectFundingStatus } from "@/api/compat/wallet/fund/status";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("development funding wallet settlement", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(
      `truncate table wallet_capability.debits,wallet_capability.credits,checkout_capability.checkouts,funding_capability.funding_transactions,ledger_capability.entries,ledger_capability.purchase_distributions,access_capability.access_grants,entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`,
    );
  });

  afterAll(() => app.database.close());

  async function createAccount() {
    return app.authentication.register({
      email: `wallet-settlement-${newId()}@example.test`,
      username: `ws${newId().slice(0, 10)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
  }

  async function confirmDevelopmentFunding(accountId: string, amountMinor: bigint) {
    const funding = await app.fundingService.create({
      accountId,
      amountMinor,
      providerName: "development",
      idempotencyKey: `settlement-${newId()}`,
    });
    await app.fundingInitialization.process(funding.id);
    const confirmed = await app.fundingVerification.process(funding.id);
    expect(confirmed?.state).toBe("confirmed");
    return confirmed!;
  }

  it("confirms, creates one pending credit, and makes it available through the commercial worker", async () => {
    const account = await createAccount();
    const starting = await app.wallet.summary(account.id);
    expect(starting).toMatchObject({
      available: { minorAmount: 0n },
      pending: { minorAmount: 0n },
    });

    const funding = await confirmDevelopmentFunding(account.id, 4000n);
    expect(await app.walletRepository.findCreditByFunding(funding.id)).toBeNull();
    expect((await projectFundingStatus(app, account.id, funding)).wallet_credit_state).toBeNull();
    expect((await app.wallet.summary(account.id)).available.minorAmount).toBe(0n);

    let sawPendingCredit = false;
    const workerApp = new Proxy(app, {
      get(target, property, receiver) {
        if (property === "walletAvailability") {
          return {
            process: async (creditId: string) => {
              const credit = await app.walletRepository.findCreditByFunding(funding.id);
              const pending = await app.wallet.summary(account.id);
              expect(credit?.state).toBe("pending");
              expect(pending).toMatchObject({
                available: { minorAmount: 0n },
                pending: { minorAmount: 4000n },
              });
              expect(
                (await projectFundingStatus(app, account.id, funding)).wallet_credit_state,
              ).toBe("pending");
              sawPendingCredit = true;
              return app.walletAvailability.process(creditId);
            },
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as ApplicationContainer;
    const worker = new CommercialWorkflowDispatcher(workerApp, { error: () => undefined });

    await worker.runOnce();

    expect(sawPendingCredit).toBe(true);
    const credit = await app.walletRepository.findCreditByFunding(funding.id);
    expect(credit).toMatchObject({ fundingId: funding.id, state: "available" });
    expect((await projectFundingStatus(app, account.id, funding)).wallet_credit_state).toBe(
      "available",
    );
    const ending = await app.wallet.summary(account.id);
    expect(ending.available.minorAmount - starting.available.minorAmount).toBe(4000n);
    expect(ending.pending.minorAmount).toBe(0n);

    const creditCount = await app.database.query<{ count: string }>(
      `select count(*)::text as count from wallet_capability.credits where funding_id=(select id from funding_capability.funding_transactions where uuid=$1)`,
      [funding.id],
    );
    expect(creditCount.rows[0]?.count).toBe("1");

    await worker.runOnce();
    expect(await app.walletRepository.findFundingCreditWork()).toEqual([]);
    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text as count from wallet_capability.credits where funding_id=(select id from funding_capability.funding_transactions where uuid=$1)`,
          [funding.id],
        )
      ).rows[0]?.count,
    ).toBe("1");
    expect(
      (
        await app.database.query(
          `select 1 from wallet_capability.debits where account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [account.id],
        )
      ).rowCount,
    ).toBe(0);
  });

  it("does not let more than 50 already-credited confirmed fundings starve newer work", async () => {
    const account = await createAccount();
    for (let index = 0; index < 51; index++) {
      const id = newId();
      const amount = Money.of(1n, "USD");
      await app.funding.save({
        id,
        accountId: account.id,
        providerName: "development",
        providerReference: `dev-${id}`,
        canonicalAmount: amount,
        collectionAmount: amount,
        state: "confirmed",
        idempotencyKey: `settled-${id}`,
        confirmedAt: new Date(),
      });
      await app.walletRepository.createCredit({
        id: newId(),
        accountId: account.id,
        fundingId: id,
        amount,
        state: "available",
      });
    }

    const outstanding = await confirmDevelopmentFunding(account.id, 9000n);
    const work = await app.walletRepository.findFundingCreditWork(50);
    expect(work.map(({ id }) => id)).toEqual([outstanding.id]);

    const workerA = new CommercialWorkflowDispatcher(app, { error: () => undefined });
    const workerB = new CommercialWorkflowDispatcher(app, { error: () => undefined });
    await Promise.all([workerA.runOnce(), workerB.runOnce()]);

    expect(await app.walletRepository.findFundingCreditWork()).toEqual([]);
    expect(await app.walletRepository.findCreditByFunding(outstanding.id)).toMatchObject({
      fundingId: outstanding.id,
      state: "available",
    });
    await workerA.runOnce();
    expect(await app.walletRepository.findFundingCreditWork()).toEqual([]);
  });
});
