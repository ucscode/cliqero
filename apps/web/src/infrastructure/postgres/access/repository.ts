import {
  AccessGrant,
  type AccessGrantRepository,
  type AccessGrantState,
} from "@/modules/access/access";
import type { QueryExecutor } from "../shared/database";

interface GrantRow {
  id: string;
  entitlement_id: string;
  token_hash: Buffer;
  state: AccessGrantState;
}

export class PostgresAccessGrantRepository implements AccessGrantRepository {
  constructor(private readonly sql: QueryExecutor) {}
  async findByTokenHash(tokenHash: Buffer): Promise<AccessGrant | null> {
    const row = (
      await this.sql.query<GrantRow>(
        `select g.uuid as id,(select uuid from entitlement_capability.entitlements where id=g.entitlement_id) as entitlement_id,g.token_hash,g.state from access_capability.access_grants g where g.token_hash=$1`,
        [tokenHash],
      )
    ).rows[0];
    return row ? AccessGrant.restore(row.id, row.entitlement_id, row.token_hash, row.state) : null;
  }
  async save(grant: AccessGrant, idempotencyKey?: string): Promise<void> {
    await this.sql.query(
      `insert into access_capability.access_grants (uuid,entitlement_id,token_hash,state,idempotency_key)
       values ($1,(select id from entitlement_capability.entitlements where uuid=$2),$3,$4,$5)`,
      [grant.id, grant.entitlementId, grant.tokenHash, grant.state, idempotencyKey ?? null],
    );
  }
}
