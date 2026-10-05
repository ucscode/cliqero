import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("account debt PostgreSQL ledger", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(
      `truncate table ledger_capability.account_debt_entries restart identity`,
    );
  });

  afterAll(() => app.database.close());

  it("persists correlated increases, caps inflow settlement, supports privileged write-off, and rejects over-settlement", async () => {
    const actor = await app.authentication.register({
      email: `debt-${newId()}@example.test`,
      username: `debt_${newId().replaceAll("-", "").slice(0, 12)}`,
      password: "integration-test-password",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [actor.id],
    );
    const increaseInput = {
      accountId: actor.id,
      amountMinor: 900n,
      wallet: "funding" as const,
      sourceKind: "funding_reversal",
      sourceId: "funding-case-42",
      reason: "Confirmed funding chargeback exceeded available balance",
      actor: { kind: "system" as const, id: "funding-reversal-processor" },
      correlationId: newId(),
      idempotencyKey: newId(),
    };
    const created = await app.accountDebt.increase(increaseInput);
    const repeated = await app.accountDebt.increase(increaseInput);
    expect(created.changed).toBe(true);
    expect(repeated.changed).toBe(false);
    expect(await app.accountDebt.balance(actor.id, actor.id)).toBe("900");

    const settlement = await app.accountDebt.settleInflow({
      ...increaseInput,
      incomingMinor: 700n,
      wallet: "earnings",
      sourceKind: "purchase_earning",
      sourceId: "earning-42",
      reason: "Future earnings settle outstanding account debt before spendability",
      actor: { kind: "system", id: "purchase-distribution-processor" },
      correlationId: newId(),
      idempotencyKey: newId(),
    });
    expect(settlement.settledMinor).toBe(700n);
    expect(await app.accountDebt.balance(actor.id, actor.id)).toBe("200");

    const writeOff = await app.accountDebt.writeOff(actor.id, {
      accountId: actor.id,
      amountMinor: 200n,
      sourceKind: "operator_write_off",
      sourceId: "case-42",
      reason: "Approved unrecoverable balance write-off",
      correlationId: newId(),
      idempotencyKey: newId(),
    });
    expect(writeOff.entry?.kind).toBe("write_off");
    expect(await app.accountDebt.balance(actor.id, actor.id)).toBe("0");
    await expect(
      app.database.query(
        `insert into ledger_capability.account_debt_entries
          (uuid,account_id,kind,amount_minor,wallet,source_kind,source_id,reason,actor_kind,actor_system,
           correlation_id,idempotency_key,request_fingerprint)
         values($1,(select id from identity_capability.accounts where uuid=$2),'write_off',1,'account',
           'manual_test','over-settlement','Must be rejected','system','integration-test',$3,$4,'fingerprint')`,
        [newId(), actor.id, newId(), newId()],
      ),
    ).rejects.toThrow(/cannot be settled or written off beyond its outstanding balance/);
  });
});
