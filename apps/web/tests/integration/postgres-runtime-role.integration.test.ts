import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { verifyProductionDatabaseRole } from "@/infrastructure/postgres/runtime-security";
import {
  OutboxDispatcher,
  OutboxHandlerRegistry,
  type WorkerLogger,
} from "@/workers/outbox/dispatcher";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const schemas = [
  "access_capability",
  "better_auth",
  "checkout_capability",
  "entitlement_capability",
  "funding_capability",
  "identity_capability",
  "kernel",
  "ledger_capability",
  "listing_capability",
  "money_capability",
  "payment_capability",
  "purchase_capability",
  "referral_capability",
  "treasury_capability",
  "wallet_capability",
  "withdrawal_capability",
] as const;
const silent: WorkerLogger = { info: () => undefined, error: () => undefined };

suite("restricted PostgreSQL runtime role", () => {
  const bootstrap = createContainer(databaseUrl!);
  const runtimeRoles: string[] = [];

  afterAll(async () => {
    for (const role of runtimeRoles) {
      await bootstrap.database.query(
        `select pg_terminate_backend(pid) from pg_stat_activity where usename=$1 and pid<>pg_backend_pid()`,
        [role],
      );
      await bootstrap.database.query(`drop owned by "${role}"`);
      await bootstrap.database.query(`drop role "${role}"`);
    }
    await bootstrap.database.close();
  });

  it("supports authentication, debt accounting and outbox work but cannot elevate or bypass financial triggers", async () => {
    const role = `cliqero_test_runtime_${randomUUID().replaceAll("-", "")}`;
    const password = randomBytes(32).toString("hex");
    runtimeRoles.push(role);
    await bootstrap.database.query(
      `create role "${role}" login password '${password}' nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit`,
    );
    await bootstrap.database.query(
      `grant connect on database ${quoteIdentifier(new URL(databaseUrl!).pathname.slice(1))} to "${role}"`,
    );
    for (const schema of schemas) {
      await bootstrap.database.query(
        `grant usage on schema ${quoteIdentifier(schema)} to "${role}"`,
      );
      await bootstrap.database.query(
        `grant select, insert, update, delete on all tables in schema ${quoteIdentifier(schema)} to "${role}"`,
      );
      await bootstrap.database.query(
        `grant usage, select on all sequences in schema ${quoteIdentifier(schema)} to "${role}"`,
      );
      await bootstrap.database.query(
        `grant execute on all functions in schema ${quoteIdentifier(schema)} to "${role}"`,
      );
    }
    await bootstrap.database.query(`revoke all on schema public from public`);

    const attributes = await bootstrap.database.query<{
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      rolinherit: boolean;
    }>(
      `select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit from pg_roles where rolname=$1`,
      [role],
    );
    expect(attributes.rows[0]).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
      rolinherit: false,
    });

    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.username = role;
    runtimeUrl.password = password;
    await verifyProductionDatabaseRole({
      NODE_ENV: "production",
      DATABASE_URL: runtimeUrl.toString(),
      POSTGRES_USER: new URL(databaseUrl!).username,
    });
    const app = createContainer(runtimeUrl.toString());
    try {
      const email = `runtime-${randomUUID()}@example.test`;
      const account = await bootstrap.authentication.register({
        email,
        username: `runtime_${randomBytes(4).toString("hex")}`,
        password: "RuntimeRoleTest!2026",
        country: "NG",
      });
      const signedIn = await app.authentication.login(email, "RuntimeRoleTest!2026");
      expect(signedIn.account.id).toBe(account.id);

      await app.accountDebt.increase({
        accountId: account.id,
        amountMinor: 200n,
        wallet: "account",
        sourceKind: "runtime_role_test",
        sourceId: newId(),
        reason: "Verify restricted runtime financial writes",
        actor: { kind: "system", id: "runtime-role-test" },
        correlationId: newId(),
        idempotencyKey: newId(),
      });
      const settled = await app.accountDebt.settleInflow({
        accountId: account.id,
        incomingMinor: 75n,
        wallet: "funding",
        sourceKind: "runtime_role_test_credit",
        sourceId: newId(),
        reason: "Verify restricted runtime debt settlement",
        actor: { kind: "system", id: "runtime-role-test" },
        correlationId: newId(),
        idempotencyKey: newId(),
      });
      expect(settled.settledMinor).toBe(75n);

      const eventId = newId();
      await bootstrap.database.query(
        `update kernel.outbox_events set available_at=now()+interval '1 hour' where state='pending'`,
      );
      await app.outbox.append([
        {
          id: eventId,
          name: "runtime-role.test",
          aggregateId: newId(),
          correlationId: newId(),
          occurredAt: new Date(),
          payload: {},
        },
      ]);
      const handled: string[] = [];
      const dispatcher = new OutboxDispatcher(
        `runtime-role-${randomBytes(3).toString("hex")}`,
        app.outbox,
        new OutboxHandlerRegistry().register({
          eventNames: ["runtime-role.test"],
          handle: async (event) => {
            handled.push(event.id);
          },
        }),
        silent,
        { pollMilliseconds: 1, staleAfterMilliseconds: 100 },
      );
      await dispatcher.runOnce();
      expect(handled).toContain(eventId);

      await expect(
        app.database.transaction(async () => {
          await app.database.query(`select set_config('cliqero.root_delete','on',true)`);
          await app.database.query(
            `update ledger_capability.account_debt_entries set reason='tampered' where source_kind='runtime_role_test'`,
          );
        }),
      ).rejects.toThrow(/append-only/);
      await expect(
        app.database.query(
          `alter table ledger_capability.account_debt_entries disable trigger all`,
        ),
      ).rejects.toThrow();
      await expect(app.database.query(`set session_replication_role = replica`)).rejects.toThrow();
      const debt = await app.database.query<{ balance_minor: string }>(
        `select coalesce(sum(case when kind='increase' then amount_minor else -amount_minor end),0)::text balance_minor
           from ledger_capability.account_debt_entries where account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [account.id],
      );
      expect(debt.rows[0]?.balance_minor).toBe("125");
    } finally {
      await app.database.close();
    }
  });
});

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
