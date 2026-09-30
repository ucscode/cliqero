import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { QueryExecutor } from "./shared/database";
import { assertApiScopes } from "@/modules/identity/api/scopes";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { ApiKeyRecord as IdentityApiKeyRecord } from "@/modules/identity/api/keys";

export type ApiKeyRecord = IdentityApiKeyRecord;
export class PostgresApiKeyRepository {
  constructor(private readonly sql: QueryExecutor) {}
  async insert(input: {
    accountId: string;
    name: string;
    keyPrefix: string;
    secretHash: Buffer;
    scopes: string[];
    createdBy: string;
    expiresAt: Date | null;
  }) {
    const id = (
      await this.sql.query<{ id: string; created_at: Date; expires_at: Date | null }>(
        `insert into identity_capability.api_keys(account_id,name,key_prefix,secret_hash,scopes,created_by,expires_at) values((select id from identity_capability.accounts where uuid=$1),$2,$3,$4,$5::jsonb,(select id from identity_capability.accounts where uuid=$6),$7) returning uuid as id,created_at,expires_at`,
        [
          input.accountId,
          input.name,
          input.keyPrefix,
          input.secretHash,
          JSON.stringify(input.scopes),
          input.createdBy,
          input.expiresAt,
        ],
      )
    ).rows[0];
    return id;
  }
  async findActiveByPrefix(prefix: string) {
    const row = (
      await this.sql.query<{
        id: string;
        account_id: string;
        name: string;
        key_prefix: string;
        secret_hash: Buffer;
        scopes: string[];
        created_at: Date;
        last_used_at: Date | null;
        expires_at: Date | null;
        revoked_at: Date | null;
      }>(
        `select k.uuid as id,(select uuid from identity_capability.accounts where id=k.account_id) as account_id,k.name,k.key_prefix,k.secret_hash,k.scopes,k.created_at,k.last_used_at,k.expires_at,k.revoked_at from identity_capability.api_keys k where k.key_prefix=$1 and k.revoked_at is null and (k.expires_at is null or k.expires_at>now())`,
        [prefix],
      )
    ).rows[0];
    return row;
  }
  async touch(id: string) {
    await this.sql.query(
      `update identity_capability.api_keys set last_used_at=now() where uuid=$1`,
      [id],
    );
  }
  async list(
    accountId?: string,
    order: { sort?: "created" | "name" | "expires"; direction?: "asc" | "desc" } = {},
    filters: { search?: string; state?: "active" | "expired" | "deleted" | "all" } = {},
  ) {
    const sort = order.sort ?? "created";
    const direction = order.direction ?? "desc";
    const orderBy =
      sort === "name" ? "lower(k.name)" : sort === "expires" ? "k.expires_at" : "k.created_at";
    const nullOrder = sort === "expires" ? "(k.expires_at is null) asc," : "";
    const state = filters.state;
    const search = filters.search?.trim();
    const rows = await this.sql.query<ApiKeyRecord>(
      `select k.uuid as id,a.uuid as "accountId",a.username as "accountUsername",p.email as "accountEmail",k.name,k.key_prefix as "keyPrefix",k.scopes,k.created_at as "createdAt",k.last_used_at as "lastUsedAt",k.expires_at as "expiresAt",k.revoked_at as "revokedAt"
       from identity_capability.api_keys k join identity_capability.accounts a on a.id=k.account_id
       left join identity_capability.account_profiles p on p.id=a.id
       where ($1::uuid is null or k.account_id=(select id from identity_capability.accounts where uuid=$1))
         and ($2::text is null or (k.uuid::text||' '||k.name||' '||a.username||' '||coalesce(p.email,'')) ilike '%'||$2||'%')
         and ($3::text is null or $3='all' or ($3='deleted' and k.revoked_at is not null) or ($3='expired' and k.revoked_at is null and k.expires_at<=now()) or ($3='active' and k.revoked_at is null and (k.expires_at is null or k.expires_at>now())))
       order by ${nullOrder}${orderBy} ${direction} nulls last,k.id ${direction}`,
      [accountId ?? null, search || null, state ?? null],
    );
    return rows.rows;
  }
  async findById(id: string, accountId?: string) {
    const result = await this.sql.query<ApiKeyRecord>(
      `select k.uuid as id,a.uuid as "accountId",a.username as "accountUsername",p.email as "accountEmail",k.name,k.key_prefix as "keyPrefix",k.scopes,k.created_at as "createdAt",k.last_used_at as "lastUsedAt",k.expires_at as "expiresAt",k.revoked_at as "revokedAt"
       from identity_capability.api_keys k join identity_capability.accounts a on a.id=k.account_id left join identity_capability.account_profiles p on p.id=a.id
       where k.uuid=$1 and ($2::uuid is null or k.account_id=(select id from identity_capability.accounts where uuid=$2))`,
      [id, accountId ?? null],
    );
    return result.rows[0] ?? null;
  }
  async revoke(id: string, accountId?: string) {
    const result = await this.sql.query(
      `update identity_capability.api_keys set revoked_at=now() where uuid=$1 and revoked_at is null and ($2::uuid is null or account_id=(select id from identity_capability.accounts where uuid=$2))`,
      [id, accountId ?? null],
    );
    return (result.rowCount ?? 0) > 0;
  }
  async update(id: string, input: { name: string; scopes: string[]; expiresAt: Date | null }) {
    const result = await this.sql.query(
      `update identity_capability.api_keys set name=$2,scopes=$3::jsonb,expires_at=$4
       where uuid=$1 and revoked_at is null`,
      [id, input.name, JSON.stringify(input.scopes), input.expiresAt],
    );
    return (result.rowCount ?? 0) === 1;
  }
}
export class ApiKeyService {
  constructor(
    private readonly repository: PostgresApiKeyRepository,
    private readonly sql: QueryExecutor,
    private readonly uow?: UnitOfWork,
  ) {}
  async create(input: {
    accountId: string;
    name: string;
    scopes: string[];
    createdBy: string;
    expiresAt?: Date | null;
  }) {
    const operation = async () => {
      const scopes = [...assertApiScopes(input.scopes)];
      const secret = `cliq_live_${randomBytes(32).toString("base64url")}`;
      const prefix = secret.slice(0, 18);
      const inserted = await this.repository.insert({
        accountId: input.accountId,
        name: input.name.trim(),
        keyPrefix: prefix,
        secretHash: hash(secret),
        scopes,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt ?? null,
      });
      return {
        id: inserted.id,
        secret,
        name: input.name.trim(),
        scopes,
        keyPrefix: prefix,
        createdAt: inserted.created_at,
        expiresAt: inserted.expires_at,
      };
    };
    return this.uow ? this.uow.transaction(operation) : operation();
  }
  async authenticate(secret: string) {
    if (!secret.startsWith("cliq_live_") || secret.length > 200) return null;
    const prefix = secret.slice(0, 18);
    const row = await this.repository.findActiveByPrefix(prefix);
    if (!row) return null;
    const actual = hash(secret);
    if (actual.length !== row.secret_hash.length || !timingSafeEqual(actual, row.secret_hash))
      return null;
    await this.repository.touch(row.id);
    return { id: row.id, accountId: row.account_id, name: row.name, scopes: row.scopes };
  }
  list(
    accountId?: string,
    order?: { sort?: "created" | "name" | "expires"; direction?: "asc" | "desc" },
    filters?: { search?: string; state?: "active" | "expired" | "deleted" | "all" },
  ) {
    return this.repository.list(accountId, order, filters);
  }
  revoke(id: string, accountId?: string) {
    return this.repository.revoke(id, accountId);
  }
  find(id: string, accountId?: string) {
    return this.repository.findById(id, accountId);
  }
  update(id: string, input: { name: string; scopes: string[]; expiresAt: Date | null }) {
    return this.repository.update(id, input);
  }
}
function hash(secret: string) {
  return createHash("sha256").update(secret).digest();
}
