import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { OperatorBulkWorkflow } from "@/application/operator/bulk-workflow";
import { newId } from "@/kernel/ids";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("Treasury adjustment PostgreSQL persistence", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(async () => {
    await app.database.query(
      `truncate table treasury_capability.adjustments,treasury_capability.entries restart identity cascade`,
    );
    await app.database.query(
      `insert into identity_capability.accounts(uuid,username)
       values ('00000000-0000-0000-0000-0000000000aa','treasury-actor-a')
       on conflict (uuid) do nothing`,
    );
  });
  afterEach(async () => {
    await app.database.query(
      `truncate table treasury_capability.adjustments,treasury_capability.entries restart identity cascade`,
    );
  });
  afterAll(() => app.database.close());

  it("persists adjustment and matching ledger fact atomically and idempotently", async () => {
    const input = {
      amountMinor: -500n,
      reason: "Correct an erroneous allocation",
      reference: "CASE-42",
      actorId: "00000000-0000-0000-0000-0000000000aa",
      idempotencyKey: newId(),
    };
    const first = await app.treasury.createAdjustment(input);
    const repeated = await app.treasury.createAdjustment(input);
    expect(repeated.id).toBe(first.id);
    expect(first).toMatchObject({
      direction: "debit",
      amountMinor: 500n,
      title: "Treasury adjustment",
      sourceKind: "treasury_adjustment",
      note: "Correct an erroneous allocation\nReference: CASE-42",
    });
    const source = await app.database.query<any>(
      `select uuid,amount_minor,reason,reference from treasury_capability.adjustments where uuid=$1`,
      [first.sourceId],
    );
    expect(source.rows).toHaveLength(1);
    expect(source.rows[0]).toMatchObject({
      amount_minor: "-500",
      reason: input.reason,
      reference: input.reference,
    });
    expect(
      (await app.database.query(`select count(*)::int count from treasury_capability.entries`))
        .rows[0].count,
    ).toBe(1);
  });

  it("root deletion removes the adjustment and ledger fact while preserving an audit snapshot", async () => {
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
    const entry = await app.treasury.createAdjustment({
      amountMinor: 750n,
      reason: "Root deletion test adjustment",
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
      (
        await app.database.query("select 1 from treasury_capability.adjustments where uuid=$1", [
          entry.sourceId,
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (
        await app.database.query(
          `select previous_state->'entry'->>'title' title from kernel.audit_records
        where action='root.delete' and subject_type='treasury_entry' and subject_id=$1`,
          [entry.id],
        )
      ).rows,
    ).toEqual([{ title: "Treasury adjustment" }]);
  });
});
