import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { CapabilityAdministrationService } from "./capability-administration";

type Row = Record<string, unknown>;

class FakeDatabase implements SqlExecutor, UnitOfWork {
  readonly accounts = new Set<string>();
  readonly capabilities = new Map<string, Map<string, string>>();
  readonly audits: Row[] = [];

  async transaction<T>(operation: () => Promise<T>) {
    return operation();
  }

  async query<TRow extends Row = Row>(sql: string, values: readonly unknown[] = []) {
    const text = sql.replace(/\s+/g, " ").trim();
    const accountId = String(values[0] ?? "");
    if (text.startsWith("select ac.capability from identity_capability.account_capabilities")) {
      const rows = [...(this.capabilities.get(accountId)?.keys() ?? [])].map((capability) => ({
        capability,
      }));
      return this.result(rows) as unknown as QueryResult<TRow>;
    }
    if (text.startsWith("select 1 from identity_capability.accounts")) {
      return this.result(
        this.accounts.has(accountId) ? [{ one: 1 }] : [],
      ) as unknown as QueryResult<TRow>;
    }
    if (text.startsWith("select ac.capability,ac.granted_at")) {
      const rows = [...(this.capabilities.get(accountId)?.entries() ?? [])].map(
        ([capability, granted_at]) => ({ capability, granted_at }),
      );
      return this.result(rows) as unknown as QueryResult<TRow>;
    }
    if (text.startsWith("select ac.granted_at")) {
      const capability = String(values[1]);
      const grantedAt = this.capabilities.get(accountId)?.get(capability);
      return this.result(
        grantedAt ? [{ granted_at: grantedAt }] : [],
      ) as unknown as QueryResult<TRow>;
    }
    if (text.startsWith("insert into identity_capability.account_capabilities")) {
      const capability = String(values[1]);
      const assignments = this.capabilities.get(accountId) ?? new Map<string, string>();
      this.capabilities.set(accountId, assignments);
      if (assignments.has(capability)) return this.result([]) as unknown as QueryResult<TRow>;
      const grantedAt = new Date().toISOString();
      assignments.set(capability, grantedAt);
      return this.result([{ granted_at: grantedAt }]) as unknown as QueryResult<TRow>;
    }
    if (text.startsWith("select account_id from identity_capability.account_capabilities")) {
      const rows = [...this.capabilities.entries()]
        .filter(([, assignments]) => assignments.has("system.root"))
        .map(([account_id]) => ({ account_id }));
      return this.result(rows) as unknown as QueryResult<TRow>;
    }
    if (text.startsWith("delete from identity_capability.account_capabilities")) {
      const capability = String(values[1]);
      const assignments = this.capabilities.get(accountId);
      const changed = assignments?.delete(capability) ? 1 : 0;
      return this.result([], changed) as unknown as QueryResult<TRow>;
    }
    if (text.startsWith("insert into kernel.audit_records")) {
      this.audits.push({ action: values[1], subject_id: values[2] });
      return this.result([]) as unknown as QueryResult<TRow>;
    }
    return this.result([]) as unknown as QueryResult<TRow>;
  }

  private result<TRow extends Row>(rows: TRow[], rowCount = rows.length) {
    return { rows, rowCount, command: "", oid: 0, fields: [] } as unknown as QueryResult<TRow>;
  }
}

describe("CapabilityAdministrationService", () => {
  const ids = {
    actor: "00000000-0000-4000-8000-000000000001",
    target: "00000000-0000-4000-8000-000000000002",
    other: "00000000-0000-4000-8000-000000000003",
  };

  function makeService() {
    const database = new FakeDatabase();
    for (const id of Object.values(ids)) database.accounts.add(id);
    return { database, service: new CapabilityAdministrationService(database, database) };
  }

  it("enforces delegation and keeps grants idempotent", async () => {
    const { database, service } = makeService();
    database.capabilities.set(
      ids.actor,
      new Map([
        ["capabilities.manage", new Date().toISOString()],
        ["catalogue.manage", new Date().toISOString()],
      ]),
    );
    const granted = await service.grant(ids.actor, ids.target, "catalogue.manage");
    expect(granted.changed).toBe(true);
    expect((await service.grant(ids.actor, ids.target, "catalogue.manage")).changed).toBe(false);
    await expect(service.grant(ids.actor, ids.target, "treasury.manage")).rejects.toMatchObject({
      code: "capability_delegation_forbidden",
    });
    expect(database.audits).toHaveLength(1);
  });

  it("allows root administration but protects the final root", async () => {
    const { database, service } = makeService();
    database.capabilities.set(ids.actor, new Map([["system.root", new Date().toISOString()]]));
    await service.grant(ids.actor, ids.target, "system.root");
    await expect(service.revoke(ids.actor, ids.target, "system.root")).resolves.toMatchObject({
      changed: true,
    });
    await service.grant(ids.actor, ids.target, "system.root");
    await expect(service.revoke(ids.actor, ids.actor, "system.root")).resolves.toMatchObject({
      changed: true,
    });
    await expect(service.revoke(ids.target, ids.target, "system.root")).rejects.toMatchObject({
      code: "last_root_protected",
    });
  });

  it("reports direct assignments without expanding root authority", async () => {
    const { database, service } = makeService();
    database.capabilities.set(ids.actor, new Map([["system.root", new Date().toISOString()]]));
    const view = await service.inspect(ids.actor, ids.actor);
    expect(view.assignments.map((item) => item.capability)).toEqual(["system.root"]);
    expect(view.manageableCapabilities).toContain("treasury.manage");
  });

  it("rejects capabilities outside the canonical registry", async () => {
    const { service } = makeService();
    await expect(service.grant(ids.actor, ids.target, "admin.superuser")).rejects.toMatchObject({
      code: "unknown_capability",
      status: 400,
    });
  });
});
