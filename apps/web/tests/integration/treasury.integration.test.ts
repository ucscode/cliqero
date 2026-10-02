import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { OperatorBulkWorkflow } from "@/application/operator/bulk-workflow";
import { newId } from "@/kernel/ids";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("treasury PostgreSQL idempotency", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(async () => {
    await app.database.query(`truncate table treasury_capability.entries`);
    await app.database.query(
      `insert into identity_capability.accounts(uuid,username)
       values
         ('00000000-0000-0000-0000-0000000000aa','treasury-actor-a'),
         ('00000000-0000-0000-0000-0000000000bb','treasury-actor-b')
       on conflict (uuid) do nothing`,
    );
  });
  afterEach(async () => {
    await app.database.query(`truncate table treasury_capability.entries`);
  });
  afterAll(() => app.database.close());
  const request = (
    overrides: Partial<{
      direction: "credit" | "debit";
      amountMinor: bigint;
      title: string;
      note: string | null;
      actorId: string;
      idempotencyKey: string;
    }> = {},
  ) =>
    app.treasury.createManual({
      direction: "credit",
      amountMinor: 500n,
      title: "Correction",
      note: "same request",
      actorId: "00000000-0000-0000-0000-0000000000aa",
      idempotencyKey: "manual-key",
      ...overrides,
    });

  it("returns one persisted fact for an equivalent repeated request", async () => {
    const first = await request(),
      second = await request();
    expect(second).toMatchObject({ id: first.id, direction: "credit", amountMinor: 500n });
    expect(
      (await app.database.query(`select count(*)::int as count from treasury_capability.entries`))
        .rows[0].count,
    ).toBe(1);
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(500n);
  });

  it.each([
    ["direction", { direction: "debit" as const }],
    ["amount", { amountMinor: 501n }],
    ["title", { title: "Different correction" }],
    ["note", { note: "Different explanation" }],
    ["actor", { actorId: "00000000-0000-0000-0000-0000000000bb" }],
  ])("rejects a same-key request with a different %s", async (_field, change) => {
    await request();
    await expect(request(change)).rejects.toThrow("idempotency key");
    expect(
      (await app.database.query(`select count(*)::int as count from treasury_capability.entries`))
        .rows[0].count,
    ).toBe(1);
  });

  it("converges concurrent equivalent requests on one fact", async () => {
    const results = await Promise.all([request(), request()]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await app.database.query(`select count(*)::int as count from treasury_capability.entries`))
        .rows[0].count,
    ).toBe(1);
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(500n);
  });

  it("allows only one financial effect for concurrent conflicting requests", async () => {
    const results = await Promise.allSettled([
      request(),
      request({ direction: "debit", amountMinor: 700n, title: "Conflicting request" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (await app.database.query(`select count(*)::int as count from treasury_capability.entries`))
        .rows[0].count,
    ).toBe(1);
  });

  it("system.root bulk deletion removes a manual Treasury fact and audits its snapshot", async () => {
    const root = await app.authentication.register({
      email: `treasury-root-${newId()}@example.test`,
      username: `tr${newId().replaceAll("-", "").slice(0, 12)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [root.id],
    );
    const entry = await app.treasury.createManual({
      direction: "credit",
      amountMinor: 750n,
      title: "Root deletion test",
      note: "Manual Treasury fixture",
      actorId: root.id,
      idempotencyKey: newId(),
    });

    const outcome = await new OperatorBulkWorkflow(app).execute(root, {
      resource: "treasury",
      action: "delete",
      ids: [entry.id],
    });

    expect(outcome).toEqual({ succeeded: [entry.id], failed: [] });
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(0n);
    expect(
      await app.database.query("select 1 from treasury_capability.entries where uuid=$1", [
        entry.id,
      ]),
    ).toMatchObject({ rows: [] });
    expect(
      await app.database.query(
        `select previous_state->>'title' title from kernel.audit_records
          where action='root.delete' and subject_type='treasury_entry' and subject_id=$1`,
        [entry.id],
      ),
    ).toMatchObject({ rows: [{ title: entry.title }] });
  });
});
