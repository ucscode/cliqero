import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SqlExecutor } from "./database";
import { assertApiScopes } from "@/modules/identity/api-scopes";

export interface ApiKeyRecord {
  id: string;
  accountId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}
export class PostgresApiKeyRepository {
  constructor(private readonly sql: SqlExecutor) {}
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
      await this.sql.query<{ id: string }>(
        `insert into identity_capability.api_keys(account_id,name,key_prefix,secret_hash,scopes,created_by,expires_at) values((select id from identity_capability.accounts where uuid=$1),$2,$3,$4,$5::jsonb,(select id from identity_capability.accounts where uuid=$6),$7) returning uuid as id`,
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
    ).rows[0].id;
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
  async list(accountId?: string) {
    const rows = await this.sql.query<ApiKeyRecord>(
      `select k.uuid as id,(select uuid from identity_capability.accounts where id=k.account_id) as "accountId",k.name,k.key_prefix as "keyPrefix",k.scopes,k.created_at as "createdAt",k.last_used_at as "lastUsedAt",k.expires_at as "expiresAt",k.revoked_at as "revokedAt" from identity_capability.api_keys k where ($1::uuid is null or k.account_id=(select id from identity_capability.accounts where uuid=$1)) order by k.created_at desc,k.id desc`,
      [accountId ?? null],
    );
    return rows.rows;
  }
  async revoke(id: string, accountId?: string) {
    const result = await this.sql.query(
      `update identity_capability.api_keys set revoked_at=coalesce(revoked_at,now()) where uuid=$1 and ($2::uuid is null or account_id=(select id from identity_capability.accounts where uuid=$2))`,
      [id, accountId ?? null],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
export class ApiKeyService {
  constructor(
    private readonly repository: PostgresApiKeyRepository,
    private readonly sql: SqlExecutor,
  ) {}
  async create(input: {
    accountId: string;
    name: string;
    scopes: string[];
    createdBy: string;
    expiresAt?: Date | null;
  }) {
    const scopes = [...assertApiScopes(input.scopes)];
    const secret = `cliq_live_${randomBytes(32).toString("base64url")}`;
    const prefix = secret.slice(0, 18);
    const id = await this.repository.insert({
      accountId: input.accountId,
      name: input.name.trim(),
      keyPrefix: prefix,
      secretHash: hash(secret),
      scopes,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt ?? null,
    });
    return { id, secret, name: input.name.trim(), scopes };
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
  list(accountId?: string) {
    return this.repository.list(accountId);
  }
  revoke(id: string, accountId?: string) {
    return this.repository.revoke(id, accountId);
  }
}
function hash(secret: string) {
  return createHash("sha256").update(secret).digest();
}
