import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  CapabilityAssignment,
  CapabilityAssignmentStore,
} from "@/application/identity/capability-administration";
import { isCapability, type Capability } from "@/modules/identity/capabilities";

export class PostgresCapabilityAssignmentStore implements CapabilityAssignmentStore {
  constructor(private readonly sql: QueryExecutor) {}

  async assignments(accountId: string): Promise<CapabilityAssignment[]> {
    const result = await this.sql.query<{ capability: string; granted_at: string }>(
      `select ac.capability,ac.granted_at
       from identity_capability.account_capabilities ac
       join identity_capability.accounts a on a.id=ac.account_id
       where a.uuid=$1 order by ac.capability`,
      [accountId],
    );
    return result.rows
      .filter((row): row is { capability: Capability; granted_at: string } =>
        isCapability(row.capability),
      )
      .map((row) => ({ capability: row.capability, grantedAt: row.granted_at }));
  }

  async assignment(accountId: string, capability: Capability): Promise<string | null> {
    const result = await this.sql.query<{ granted_at: string }>(
      `select ac.granted_at
       from identity_capability.account_capabilities ac
       join identity_capability.accounts a on a.id=ac.account_id
       where a.uuid=$1 and ac.capability=$2`,
      [accountId, capability],
    );
    return result.rows[0]?.granted_at ?? null;
  }

  async lockRootAssignments(): Promise<number> {
    const roots = await this.sql.query<{ account_id: string }>(
      `select account_id from identity_capability.account_capabilities
       where capability='system.root' for update`,
    );
    return roots.rowCount ?? roots.rows.length;
  }

  async grant(accountId: string, capability: Capability) {
    const inserted = await this.sql.query<{ granted_at: string }>(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),$2)
       on conflict (account_id,capability) do nothing
       returning granted_at`,
      [accountId, capability],
    );
    if (inserted.rowCount)
      return { changed: true, grantedAt: inserted.rows[0].granted_at };
    const grantedAt = await this.assignment(accountId, capability);
    if (!grantedAt) throw new Error("Capability assignment disappeared during grant");
    return { changed: false, grantedAt };
  }

  async revoke(accountId: string, capability: Capability): Promise<boolean> {
    const removed = await this.sql.query(
      `delete from identity_capability.account_capabilities
       where account_id=(select id from identity_capability.accounts where uuid=$1)
         and capability=$2`,
      [accountId, capability],
    );
    return Boolean(removed.rowCount);
  }
}
