import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { OperatorFundingService } from "@/application/operator/funding";
import { PostgresAdministrativeFundingRepository } from "@/infrastructure/postgres/funding/administrative";
import { PostgresOperatorFundingReader } from "@/infrastructure/postgres/operator/funding";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("administrative Funding CRUD PostgreSQL accounting", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(async () => {
    await app.database.query(`truncate table
      kernel.audit_records,better_auth."session",better_auth.account,better_auth.verification,
      better_auth."user",identity_capability.auth_account_links,identity_capability.sessions,
      identity_capability.accounts restart identity cascade`);
  });
  afterAll(async () => {
    await app.database.close();
    await app.authentication.betterAuth.close();
  });

  async function actors() {
    const actor = await app.authentication.register({
      email: `funding-admin-${newId()}@example.test`,
      username: `fa${newId().replaceAll("-", "").slice(0, 12)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    const customer = await app.authentication.register({
      email: `funding-customer-${newId()}@example.test`,
      username: `fc${newId().replaceAll("-", "").slice(0, 12)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [actor.id],
    );
    return { actor, customer };
  }

  it("posts only adjustment deltas, deletes the mutable record, and never double-counts it", async () => {
    const { actor, customer } = await actors();
    const created = await app.operatorFunding.createAdministrative(actor.id, {
      accountId: customer.id,
      amountMinor: "10000",
      state: "confirmed",
      reason: "Verified offline deposit",
      reference: "offline-100",
      idempotencyKey: `admin-create-${newId()}`,
    });
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(10_000n);
    expect((await app.operatorFunding.get(created.id)).canonicalAmountMinor).toBe("10000");

    const increased = await app.operatorFunding.updateAdministrative(actor.id, created.id, {
      amountMinor: "13000",
      state: "confirmed",
      reason: "Corrected deposit amount",
      reference: "offline-100",
    });
    expect(increased.amountMinor).toBe("13000");
    expect(() => JSON.stringify(increased)).not.toThrow();
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(13_000n);
    await app.operatorFunding.updateAdministrative(actor.id, created.id, {
      amountMinor: "8000",
      state: "confirmed",
      reason: "Second amount correction",
      reference: "offline-100",
    });
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(8_000n);

    const rows = await app.database.query<{ movements: string; net_minor: string }>(
      `select count(*)::text movements,coalesce(sum(amount_minor),0)::text net_minor
         from wallet_capability.funding_adjustments
        where funding_id=$1`,
      [created.id],
    );
    expect(rows.rows[0]).toEqual({ movements: "3", net_minor: "8000" });
    await app.operatorFunding.deleteAdministrative(actor.id, created.id);
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(0n);
    await expect(app.operatorFunding.get(created.id)).rejects.toThrow("Funding not found");
    const finalLedger = await app.database.query<{ movements: string; net_minor: string }>(
      `select count(*)::text movements,coalesce(sum(amount_minor),0)::text net_minor
         from wallet_capability.funding_adjustments where funding_id=$1`,
      [created.id],
    );
    expect(finalLedger.rows[0]).toEqual({ movements: "4", net_minor: "0" });
    const historical = await app.wallet.history(customer.id, { limit: 50 });
    expect(historical.items.filter((item) => item.kind === "funding_adjustment")).toHaveLength(4);
    expect(historical.items.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Verified offline deposit",
        "Corrected deposit amount",
        "Funding correction: Second amount correction",
        "Funding deleted: Second amount correction",
      ]),
    );
    expect(
      historical.items.reduce(
        (sum, item) =>
          sum + (item.direction === "credit" ? item.amount.minorAmount : -item.amount.minorAmount),
        0n,
      ),
    ).toBe((await app.wallet.summary(customer.id)).available.minorAmount);
  });

  it("replays administrative Funding creation idempotently and conflicts on changed money", async () => {
    const { actor, customer } = await actors();
    const otherCustomer = await app.authentication.register({
      email: `funding-other-${newId()}@example.test`,
      username: `fo${newId().replaceAll("-", "").slice(0, 12)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    const key = `admin-replay-${newId()}`;
    const request = {
      accountId: customer.id,
      amountMinor: "4200" as const,
      state: "confirmed" as const,
      reason: "Verified cash",
      reference: "CASH-42",
      idempotencyKey: key,
    };
    const first = await app.operatorFunding.createAdministrative(actor.id, request);
    const replays = await Promise.all([
      app.operatorFunding.createAdministrative(actor.id, request),
      app.operatorFunding.createAdministrative(actor.id, request),
    ]);
    expect(replays[0]).toMatchObject(first);
    expect(replays[1]).toMatchObject(first);
    await expect(
      app.operatorFunding.createAdministrative(actor.id, {
        ...request,
        amountMinor: "4300",
      }),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    await expect(
      app.operatorFunding.createAdministrative(actor.id, {
        ...request,
        accountId: otherCustomer.id,
      }),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    const counts = await app.database.query<{ fundings: string; movements: string }>(
      `select (select count(*)::text from funding_capability.administrative_fundings where idempotency_key=$1) fundings,
              (select count(*)::text from wallet_capability.funding_adjustments where funding_id=$2) movements`,
      [key, first.id],
    );
    expect(counts.rows[0]).toEqual({ fundings: "1", movements: "1" });
  });

  it("rejects consumed value and returns independent bulk-delete outcomes", async () => {
    const { actor, customer } = await actors();
    const unsafe = await app.operatorFunding.createAdministrative(actor.id, {
      accountId: customer.id,
      amountMinor: "10000",
      state: "confirmed",
      reason: "Funds later transferred",
      idempotencyKey: `admin-create-${newId()}`,
    });
    const safe = await app.operatorFunding.createAdministrative(actor.id, {
      accountId: customer.id,
      amountMinor: "2500",
      state: "failed",
      reason: "Non-credit record",
      idempotencyKey: `admin-create-${newId()}`,
    });
    await app.walletTransfers.transfer({
      accountId: customer.id,
      from: "funding",
      to: "earnings",
      grossMinor: 8000n,
      idempotencyKey: `consume-${newId()}`,
    });
    await expect(
      app.operatorFunding.deleteAdministrative(actor.id, unsafe.id),
    ).rejects.toMatchObject({
      code: "funding_balance_consumed",
      status: 409,
    });
    const result = await app.operatorFunding.bulkDeleteAdministrative(actor.id, [
      safe.id,
      unsafe.id,
      newId(),
    ]);
    expect(result.results.map((item) => item.deleted)).toEqual([true, false, false]);
    expect(result.results[1]?.error).toMatch(/already been consumed/);
    expect(result.results[2]?.error).toMatch(/not found/i);
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(2_000n);
  });

  it("rolls back the administrative record if posting its accounting effect fails", async () => {
    const { actor, customer } = await actors();
    const base = new PostgresAdministrativeFundingRepository(app.database);
    const failing = new Proxy(base, {
      get(target, property) {
        if (property === "recordMovement")
          return async () => {
            throw new Error("simulated ledger failure");
          };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const service = new OperatorFundingService(
      new PostgresOperatorFundingReader(app.database),
      { confirm: async () => ({}) } as never,
      { repository: failing, operators: app.operators, wallet: app.wallet, uow: app.database },
    );
    await expect(
      service.createAdministrative(actor.id, {
        accountId: customer.id,
        amountMinor: "5000",
        state: "confirmed",
        reason: "Must roll back",
        idempotencyKey: `admin-create-${newId()}`,
      }),
    ).rejects.toThrow("simulated ledger failure");
    const result = await app.database.query<{ records: string; movements: string }>(
      `select (select count(*)::text from funding_capability.administrative_fundings where account_id=(select id from identity_capability.accounts where uuid=$1)) records,
              (select count(*)::text from wallet_capability.funding_adjustments where account_id=(select id from identity_capability.accounts where uuid=$1)) movements`,
      [customer.id],
    );
    expect(result.rows[0]).toEqual({ records: "0", movements: "0" });
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(0n);
  });

  it("does not expose provider funding to administrative edit or delete", async () => {
    const { actor, customer } = await actors();
    const providerFunding = await app.fundingService.create({
      accountId: customer.id,
      amountMinor: 1200n,
      providerName: "development",
      idempotencyKey: `provider-protection-${newId()}`,
    });
    await expect(
      app.operatorFunding.deleteAdministrative(actor.id, providerFunding.id),
    ).rejects.toThrow("Administrative funding not found");
    expect(await app.funding.findById(providerFunding.id)).toMatchObject({
      id: providerFunding.id,
      providerName: "development",
      state: "initialization_pending",
    });
    const adminCount = await app.database.query<{ count: string }>(
      `select count(*)::text count from funding_capability.administrative_fundings where uuid=$1`,
      [providerFunding.id],
    );
    expect(adminCount.rows[0]?.count).toBe("0");
  });
});
