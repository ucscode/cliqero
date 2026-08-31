import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { newId, type Id } from "@/kernel/ids";
import type { IntegrationPrincipal } from "./access";
import type { SqlExecutor } from "@/infrastructure/postgres/database";

const hashCredential = (salt: Buffer, secret: string) =>
  createHash("sha256").update(salt).update(secret, "utf8").digest();
interface IntegrationRow {
  id: string;
  owner_id: string;
  name: string;
  credential_hash: Buffer;
  credential_salt: Buffer;
  state: "active" | "revoked";
  created_at: Date;
}

export class ScopedIntegration implements IntegrationPrincipal {
  constructor(
    readonly id: Id,
    readonly ownerId: Id,
    private readonly listingIds: ReadonlySet<Id>,
  ) {}
  canVerifyListing(listingId: Id): boolean {
    return this.listingIds.has(listingId);
  }
}

export class IntegrationService {
  constructor(private readonly sql: SqlExecutor) {}
  async create(ownerId: Id, name: string, listingId: Id): Promise<{ id: Id; credential: string }> {
    const id = newId();
    const secret = randomBytes(32).toString("base64url");
    const salt = randomBytes(16);
    await this.sql.query(
      `insert into access_capability.integrations (id,owner_id,name,credential_hash,credential_salt)
       values ($1,$2,$3,$4,$5)`,
      [id, ownerId, name.trim(), hashCredential(salt, secret), salt],
    );
    await this.sql.query(
      `insert into access_capability.integration_listings (integration_id,listing_id) values ($1,$2)`,
      [id, listingId],
    );
    return { id, credential: `cli_int_${id}.${secret}` };
  }
  async authenticate(credential: string): Promise<ScopedIntegration | null> {
    const match = /^cli_int_([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(credential);
    if (!match) return null;
    const row = (
      await this.sql.query<IntegrationRow>(
        `select id,owner_id,credential_hash,credential_salt,state from access_capability.integrations where id=$1`,
        [match[1]],
      )
    ).rows[0];
    if (!row || row.state !== "active") return null;
    const candidate = hashCredential(row.credential_salt, match[2]);
    if (
      candidate.length !== row.credential_hash.length ||
      !timingSafeEqual(candidate, row.credential_hash)
    )
      return null;
    const listingRows = (
      await this.sql.query<{ listing_id: string }>(
        `select listing_id from access_capability.integration_listings where integration_id=$1`,
        [row.id],
      )
    ).rows;
    return new ScopedIntegration(
      row.id,
      row.owner_id,
      new Set(listingRows.map((item) => item.listing_id)),
    );
  }
  async list(ownerId: Id) {
    return (
      await this.sql.query<any>(
        `select i.id,i.name,i.state,i.created_at,coalesce(array_agg(il.listing_id) filter(where il.listing_id is not null),'{}') listing_ids from access_capability.integrations i left join access_capability.integration_listings il on il.integration_id=i.id where i.owner_id=$1 group by i.id order by i.created_at desc,i.id`,
        [ownerId],
      )
    ).rows.map(view);
  }
  async find(ownerId: Id, id: Id) {
    const row = (
      await this.sql.query<any>(
        `select i.id,i.name,i.state,i.created_at,coalesce(array_agg(il.listing_id) filter(where il.listing_id is not null),'{}') listing_ids from access_capability.integrations i left join access_capability.integration_listings il on il.integration_id=i.id where i.owner_id=$1 and i.id=$2 group by i.id`,
        [ownerId, id],
      )
    ).rows[0];
    if (!row) throw new Error("Integration not found");
    return view(row);
  }
  async update(ownerId: Id, id: Id, name: string) {
    const result = await this.sql.query(
      `update access_capability.integrations set name=$3,updated_at=now() where owner_id=$1 and id=$2 returning id`,
      [ownerId, id, name.trim()],
    );
    if (result.rowCount !== 1) throw new Error("Integration not found");
    return this.find(ownerId, id);
  }
  async revoke(ownerId: Id, id: Id) {
    const result = await this.sql.query(
      `update access_capability.integrations set state='revoked',updated_at=now() where owner_id=$1 and id=$2 returning id`,
      [ownerId, id],
    );
    if (result.rowCount !== 1) throw new Error("Integration not found");
    return this.find(ownerId, id);
  }
  async rotate(ownerId: Id, id: Id) {
    const secret = randomBytes(32).toString("base64url"),
      salt = randomBytes(16);
    const result = await this.sql.query(
      `update access_capability.integrations set credential_hash=$3,credential_salt=$4,state='active',updated_at=now() where owner_id=$1 and id=$2 returning id`,
      [ownerId, id, hashCredential(salt, secret), salt],
    );
    if (result.rowCount !== 1) throw new Error("Integration not found");
    return { id, credential: `cli_int_${id}.${secret}` };
  }
}
const view = (row: any) => ({
  id: row.id,
  name: row.name,
  state: row.state,
  listing_ids: row.listing_ids,
  created_at: row.created_at,
});
