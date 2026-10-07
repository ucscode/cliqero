import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { FUNDING_PROOF_CLEANUP_EVENT } from "@/kernel/events";
import { OperatorFundingService } from "@/application/operator/funding";
import { PostgresAdministrativeFundingRepository } from "@/infrastructure/postgres/funding/administrative";
import { PostgresOperatorFundingReader } from "@/infrastructure/postgres/operator/funding";
import { CommercialWorkflowDispatcher } from "@/workers/commercial/dispatcher";
import { FundingProofCleanupHandler } from "@/workers/outbox/handlers";
import {
  OutboxDispatcher,
  OutboxHandlerRegistry,
  type WorkerLogger,
} from "@/workers/outbox/dispatcher";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const silent: WorkerLogger = { info: () => undefined, error: () => undefined };

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

  async function confirmDevelopmentFunding(accountId: string, amountMinor: bigint) {
    const funding = await app.fundingService.create({
      accountId,
      amountMinor,
      providerName: "development",
      idempotencyKey: `provider-root-delete-${newId()}`,
    });
    await app.fundingInitialization.process(funding.id);
    expect((await app.fundingVerification.process(funding.id))?.state).toBe("confirmed");
    await new CommercialWorkflowDispatcher(app, { error: () => undefined }).runOnce();
    return funding;
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
    await expect(app.operatorFunding.get(created.id)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
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

  it("settles account debt before administrative funding becomes available", async () => {
    const { actor, customer } = await actors();
    await app.accountDebt.increase({
      accountId: customer.id,
      amountMinor: 6_000n,
      wallet: "account",
      sourceKind: "integration_fixture",
      sourceId: newId(),
      reason: "Known outstanding recovery fixture",
      actor: { kind: "system", id: "integration-test" },
      correlationId: newId(),
      idempotencyKey: `admin-funding-debt:${newId()}`,
    });

    const created = await app.operatorFunding.createAdministrative(actor.id, {
      accountId: customer.id,
      amountMinor: "10000",
      state: "confirmed",
      reason: "Verified administrative deposit",
      reference: "debt-settlement-fixture",
      idempotencyKey: `admin-debt-settlement:${newId()}`,
    });

    expect(await app.accountDebt.balance(actor.id, customer.id)).toBe("0");
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(4_000n);
    const rows = await app.database.query<{
      kind: string;
      amount_minor: string;
      source_kind: string;
    }>(
      `select kind,amount_minor,source_kind from ledger_capability.account_debt_entries
        where account_id=(select id from identity_capability.accounts where uuid=$1)
          and kind='settlement'`,
      [customer.id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      kind: "settlement",
      amount_minor: "6000",
      source_kind: "administrative_funding_movement",
    });
    expect(created.state).toBe("confirmed");
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

  it("paginates unified provider and administrative funding with a total UUID order", async () => {
    const { actor, customer } = await actors();
    const amountMinor = 4321n;
    const provider = await app.fundingService.create({
      accountId: customer.id,
      amountMinor,
      providerName: "development",
      idempotencyKey: `funding-page-provider-${newId()}`,
    });
    const administrative = await app.operatorFunding.createAdministrative(actor.id, {
      accountId: customer.id,
      amountMinor: amountMinor.toString(),
      state: "failed",
      reason: "Pagination tie fixture",
      idempotencyKey: `funding-page-admin-${newId()}`,
    });

    const internalIds = await app.database.query<{
      provider_id: string;
      administrative_id: string;
    }>(
      `select
         (select id::text from funding_capability.funding_transactions where uuid=$1) provider_id,
         (select id::text from funding_capability.administrative_fundings where uuid=$2) administrative_id`,
      [provider.id, administrative.id],
    );
    expect(internalIds.rows[0]?.provider_id).toBe(internalIds.rows[0]?.administrative_id);

    await app.database.query(
      `update funding_capability.funding_transactions
          set created_at='2026-01-15T12:00:00Z' where uuid=$1`,
      [provider.id],
    );
    await app.database.query(
      `update funding_capability.administrative_fundings
          set created_at='2026-01-15T12:00:00Z' where uuid=$1`,
      [administrative.id],
    );

    for (const sort of ["amount", "created"] as const) {
      for (const direction of ["asc", "desc"] as const) {
        const first = await app.operatorFunding.list({ limit: 1, sort, direction });
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).toBeTruthy();
        const second = await app.operatorFunding.list({
          limit: 1,
          sort,
          direction,
          cursor: first.nextCursor!,
        });
        const ids = [...first.items, ...second.items].map((item) => item.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids)).toEqual(new Set([provider.id, administrative.id]));
        expect(second.nextCursor).toBeNull();
      }
    }
  });

  it("returns a deliberate not-found result for a nonexistent funding ID", async () => {
    const id = newId();
    const reader = new PostgresOperatorFundingReader(app.database);
    await expect(reader.get(id)).resolves.toBeNull();
    await expect(app.operatorFunding.get(id)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("deletes a confirmed provider funding and reverses only its aggregate credit", async () => {
    const { actor, customer } = await actors();
    const administrative = await app.operatorFunding.createAdministrative(actor.id, {
      accountId: customer.id,
      amountMinor: "2000",
      state: "confirmed",
      reason: "Opening balance",
      idempotencyKey: `admin-root-delete-${newId()}`,
    });
    const providerFunding = await confirmDevelopmentFunding(customer.id, 1200n);

    await app.database.query(
      `insert into funding_capability.funding_evidence(
         uuid,funding_id,account_id,transfer_reference,
         proof_storage_provider,proof_storage_container,proof_object_key,
         proof_original_filename,proof_mime_type,proof_byte_size
       ) values(
         gen_random_uuid(),
         (select id from funding_capability.funding_transactions where uuid=$1),
         (select id from identity_capability.accounts where uuid=$2),
         'confirmed-root-delete', 'private-proof', 'evidence', 'funding/receipt.png',
         'receipt.png', 'image/png', 128
       )`,
      [providerFunding.id, customer.id],
    );

    const fundingPk = (
      await app.database.query<{ id: string }>(
        `select id::text from funding_capability.funding_transactions where uuid=$1`,
        [providerFunding.id],
      )
    ).rows[0]?.id;
    expect(fundingPk).toBeTruthy();

    expect(await app.walletRepository.findCreditByFunding(providerFunding.id)).toMatchObject({
      amount: { minorAmount: 1200n },
      state: "available",
    });
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(3200n);

    await expect(
      app.operatorFunding.deleteByOperator(actor.id, providerFunding.id),
    ).resolves.toEqual({
      id: providerFunding.id,
      deleted: true,
    });

    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(2000n);
    expect((await app.operatorFunding.get(administrative.id)).canonicalAmountMinor).toBe("2000");
    const remaining = await app.database.query<{
      funding: string;
      operations: string;
      evidence: string;
      credits: string;
      audits: string;
    }>(
      `select
         (select count(*)::text from funding_capability.funding_transactions where uuid=$2) funding,
         (select count(*)::text from payment_capability.provider_operations where funding_id=$1::bigint) operations,
         (select count(*)::text from funding_capability.funding_evidence where funding_id=$1::bigint) evidence,
         (select count(*)::text from wallet_capability.credits where funding_id=$1::bigint) credits,
         (select count(*)::text from kernel.audit_records where action='root.delete' and subject_type='funding_transaction' and subject_id=$2::text) audits`,
      [fundingPk, providerFunding.id],
    );
    expect(remaining.rows[0]).toEqual({
      funding: "0",
      operations: "0",
      evidence: "0",
      credits: "0",
      audits: "1",
    });

    const job = await app.database.query<{
      id: string;
      state: string;
      payload: {
        fundingId: string;
        storageProvider: string;
        container: string;
        key: string;
      };
    }>(
      `select id,state,payload from kernel.outbox_events where event_name=$1 and aggregate_id=$2`,
      [FUNDING_PROOF_CLEANUP_EVENT, providerFunding.id],
    );
    expect(job.rows).toHaveLength(1);
    expect(job.rows[0]).toMatchObject({
      state: "pending",
      payload: {
        fundingId: providerFunding.id,
        storageProvider: "private-proof",
        container: "evidence",
        key: "funding/receipt.png",
      },
    });

    const remove = vi.fn(async () => undefined);
    await new OutboxDispatcher(
      "funding-cleanup-test",
      app.outbox,
      new OutboxHandlerRegistry().register(
        new FundingProofCleanupHandler({
          get: vi.fn((name: string) => ({
            name,
            put: async () => ({
              provider: "private-proof",
              container: "evidence",
              key: "unused",
              byteSize: 0,
              mimeType: "application/octet-stream",
            }),
            delete: remove,
          })),
        }),
      ),
      silent,
      { pollMilliseconds: 1, staleAfterMilliseconds: 100 },
    ).runOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith({
      provider: "private-proof",
      container: "evidence",
      key: "funding/receipt.png",
    });
    const published = await app.database.query<{ state: string }>(
      `select state from kernel.outbox_events where id=$1`,
      [job.rows[0]!.id],
    );
    expect(published.rows[0]?.state).toBe("published");
  });

  it("allows root deletion after a provider credit is consumed and preserves the aggregate result", async () => {
    const { actor, customer } = await actors();
    await app.operatorFunding.createAdministrative(actor.id, {
      accountId: customer.id,
      amountMinor: "2000",
      state: "confirmed",
      reason: "Opening balance",
      idempotencyKey: `admin-consumed-delete-${newId()}`,
    });
    const providerFunding = await confirmDevelopmentFunding(customer.id, 1200n);
    await app.walletTransfers.transfer({
      accountId: customer.id,
      from: "funding",
      to: "earnings",
      grossMinor: 1000n,
      idempotencyKey: `consume-provider-funding-${newId()}`,
    });

    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(2200n);
    await expect(
      app.operatorFunding.deleteByOperator(actor.id, providerFunding.id),
    ).resolves.toEqual({
      id: providerFunding.id,
      deleted: true,
    });
    expect((await app.wallet.summary(customer.id)).available.minorAmount).toBe(1000n);
  });

  it("rolls back provider deletion when cleanup enqueueing fails", async () => {
    const { actor, customer } = await actors();
    const providerFunding = await app.fundingService.create({
      accountId: customer.id,
      amountMinor: 1200n,
      providerName: "development",
      idempotencyKey: `provider-cleanup-rollback-${newId()}`,
    });
    await app.database.query(
      `insert into funding_capability.funding_evidence(
         uuid,funding_id,account_id,transfer_reference,
         proof_storage_provider,proof_storage_container,proof_object_key,
         proof_original_filename,proof_mime_type,proof_byte_size
       ) values(
         gen_random_uuid(),
         (select id from funding_capability.funding_transactions where uuid=$1),
         (select id from identity_capability.accounts where uuid=$2),
         'cleanup-rollback', 'private-proof', 'evidence', 'funding/rollback.png',
         'rollback.png', 'image/png', 128
       )`,
      [providerFunding.id, customer.id],
    );

    const reader = new PostgresOperatorFundingReader(app.database, {
      append: async () => {
        throw new Error("cleanup enqueue unavailable");
      },
    });
    const service = new OperatorFundingService(reader, { confirm: async () => ({}) } as never, {
      repository: {} as never,
      operators: app.operators,
      wallet: app.wallet,
      uow: app.database,
    });

    await expect(service.deleteByOperator(actor.id, providerFunding.id)).rejects.toThrow(
      "cleanup enqueue unavailable",
    );
    const remaining = await app.database.query<{
      funding: string;
      evidence: string;
      audits: string;
    }>(
      `select
         (select count(*)::text from funding_capability.funding_transactions where uuid=$1) funding,
         (select count(*)::text from funding_capability.funding_evidence where funding_id=(select id from funding_capability.funding_transactions where uuid=$1)) evidence,
         (select count(*)::text from kernel.audit_records where action='root.delete' and subject_type='funding_transaction' and subject_id=$1::text) audits`,
      [providerFunding.id],
    );
    expect(remaining.rows[0]).toEqual({ funding: "1", evidence: "1", audits: "0" });
  });

  it("allows only system.root to delete provider funding and linked records", async () => {
    const { actor, customer } = await actors();
    const providerFunding = await app.fundingService.create({
      accountId: customer.id,
      amountMinor: 1200n,
      providerName: "development",
      idempotencyKey: `provider-root-delete-${newId()}`,
    });
    await app.database.query(
      `insert into payment_capability.provider_operations(
         uuid,funding_id,provider,operation,outcome
       ) values(
         gen_random_uuid(),
         (select id from funding_capability.funding_transactions where uuid=$1),
         'development','test','succeeded'
       )`,
      [providerFunding.id],
    );
    await app.database.query(
      `insert into funding_capability.funding_evidence(
         uuid,funding_id,account_id,transfer_reference
       ) values(
         gen_random_uuid(),
         (select id from funding_capability.funding_transactions where uuid=$1),
         (select id from identity_capability.accounts where uuid=$2),
         'root-delete-test'
       )`,
      [providerFunding.id, customer.id],
    );
    await app.database.query(
      `insert into wallet_capability.credits(
         uuid,amount_minor,currency,state,available_at,account_id,funding_id
       ) values(
         gen_random_uuid(),1200,'USD','available',now(),
         (select id from identity_capability.accounts where uuid=$2),
         (select id from funding_capability.funding_transactions where uuid=$1)
       )`,
      [providerFunding.id, customer.id],
    );

    await expect(
      app.operatorFunding.deleteByOperator(customer.id, providerFunding.id),
    ).rejects.toThrow("Forbidden");
    await expect(
      app.operatorFunding.deleteByOperator(actor.id, providerFunding.id),
    ).resolves.toEqual({
      id: providerFunding.id,
      deleted: true,
    });

    const remaining = await app.database.query<{
      funding: string;
      operations: string;
      evidence: string;
      credits: string;
      audits: string;
    }>(
      `select
         (select count(*)::text from funding_capability.funding_transactions where uuid=$1) funding,
         (select count(*)::text from payment_capability.provider_operations where funding_id is not null and funding_id not in (select id from funding_capability.funding_transactions)) operations,
         (select count(*)::text from funding_capability.funding_evidence where funding_id is not null and funding_id not in (select id from funding_capability.funding_transactions)) evidence,
         (select count(*)::text from wallet_capability.credits where funding_id is not null and funding_id not in (select id from funding_capability.funding_transactions)) credits,
         (select count(*)::text from kernel.audit_records where action='root.delete' and subject_type='funding_transaction' and subject_id=$1::text) audits`,
      [providerFunding.id],
    );
    expect(remaining.rows[0]).toEqual({
      funding: "0",
      operations: "0",
      evidence: "0",
      credits: "0",
      audits: "1",
    });
    const cleanupJobs = await app.database.query<{ count: string }>(
      `select count(*)::text count from kernel.outbox_events
       where event_name=$1 and aggregate_id=$2`,
      [FUNDING_PROOF_CLEANUP_EVENT, providerFunding.id],
    );
    expect(cleanupJobs.rows[0]?.count).toBe("0");
    await expect(app.operatorFunding.get(providerFunding.id)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });
});
