import { Buffer } from "node:buffer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { QueryExecutor } from "./shared/database";
import { assertApiScopes } from "@/modules/identity/api/scopes";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { ApiKeyRecord as IdentityApiKeyRecord } from "@/modules/identity/api/keys";
import { PublicApplicationError } from "@/kernel/errors";

type ApiKeyCursor = {
  scope: string;
  sort: "created" | "name" | "expires";
  direction: "asc" | "desc";
  value: string | null;
  id: string;
};

function encodeCursor(cursor: ApiKeyCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(
  token: string | undefined,
  scope: string,
  sort: ApiKeyCursor["sort"],
  direction: ApiKeyCursor["direction"],
) {
  if (!token) return null;
  try {
    const cursor = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as ApiKeyCursor;
    if (
      cursor.scope !== scope ||
      cursor.sort !== sort ||
      cursor.direction !== direction ||
      typeof cursor.id !== "string" ||
      !/^\d+$/.test(cursor.id) ||
      (cursor.value !== null && typeof cursor.value !== "string")
    )
      throw new Error();
    if (sort === "created" && (!cursor.value || Number.isNaN(Date.parse(cursor.value))))
      throw new Error();
    if (sort === "expires" && cursor.value !== null && Number.isNaN(Date.parse(cursor.value)))
      throw new Error();
    return cursor;
  } catch {
    throw new PublicApplicationError("Invalid or stale pagination cursor.", "invalid_cursor", 400);
  }
}

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
    status: "active" | "revoked";
    secretCiphertext: Buffer;
    secretNonce: Buffer;
    secretAuthTag: Buffer;
    secretKeyVersion: number;
  }) {
    const id = (
      await this.sql.query<{
        id: string;
        created_at: Date;
        expires_at: Date | null;
        revoked_at: Date | null;
      }>(
        `insert into identity_capability.api_keys(account_id,name,key_prefix,secret_hash,secret_ciphertext,secret_nonce,secret_auth_tag,secret_key_version,scopes,created_by,expires_at,revoked_at) values((select id from identity_capability.accounts where uuid=$1),$2,$3,$4,$5,$6,$7,$8,$9::jsonb,(select id from identity_capability.accounts where uuid=$10),$11,case when $12='revoked' then now() else null end) returning uuid as id,created_at,expires_at,revoked_at`,
        [
          input.accountId,
          input.name,
          input.keyPrefix,
          input.secretHash,
          input.secretCiphertext,
          input.secretNonce,
          input.secretAuthTag,
          input.secretKeyVersion,
          JSON.stringify(input.scopes),
          input.createdBy,
          input.expiresAt,
          input.status,
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
  async listPage(input: {
    accountId?: string;
    search?: string;
    state?: "active" | "expired" | "revoked" | "all";
    sort?: "created" | "name" | "expires";
    direction?: "asc" | "desc";
    limit: number;
    cursor?: string;
    authorizationScope: string;
  }) {
    const sort = input.sort ?? "created";
    const direction = input.direction ?? "desc";
    const comparator = direction === "asc" ? ">" : "<";
    const scope = JSON.stringify({
      actor: input.authorizationScope,
      accountId: input.accountId ?? null,
      search: input.search?.trim() ?? "",
      state: input.state ?? "all",
      sort,
      direction,
    });
    const cursor = decodeCursor(input.cursor, scope, sort, direction);
    const conditions = [
      "($1::uuid is null or k.account_id=(select id from identity_capability.accounts where uuid=$1))",
      "($2::text is null or (k.uuid::text||' '||k.name||' '||a.username||' '||coalesce(p.email,'')) ilike '%'||$2||'%')",
      "($3::text='all' or ($3='revoked' and k.revoked_at is not null) or ($3='expired' and k.revoked_at is null and k.expires_at<=now()) or ($3='active' and k.revoked_at is null and (k.expires_at is null or k.expires_at>now())))",
    ];
    const values: unknown[] = [
      input.accountId ?? null,
      input.search?.trim() || null,
      input.state ?? "all",
    ];
    if (cursor) {
      values.push(cursor.value, cursor.id);
      const valueParam = `$${values.length - 1}`;
      const idParam = `$${values.length}`;
      if (sort === "created") {
        conditions.push(
          `(k.created_at,k.id) ${comparator} (${valueParam}::timestamptz,${idParam}::bigint)`,
        );
      } else if (sort === "name") {
        conditions.push(
          `(lower(k.name),k.id) ${comparator} (${valueParam}::text,${idParam}::bigint)`,
        );
      } else if (cursor.value === null) {
        conditions.push(`k.expires_at is null and k.id ${comparator} ${idParam}::bigint`);
      } else {
        conditions.push(
          `(k.expires_at ${comparator} ${valueParam}::timestamptz or (k.expires_at=${valueParam}::timestamptz and k.id ${comparator} ${idParam}::bigint) or k.expires_at is null)`,
        );
      }
    }
    values.push(input.limit + 1);
    const orderBy =
      sort === "name" ? "lower(k.name)" : sort === "expires" ? "k.expires_at" : "k.created_at";
    const rows = (
      await this.sql.query<ApiKeyRecord & { cursorId: string; cursorValue: string | null }>(
        `select k.uuid as id,a.uuid as "accountId",a.username as "accountUsername",p.email as "accountEmail",k.name,k.key_prefix as "keyPrefix",k.scopes,k.created_at as "createdAt",k.last_used_at as "lastUsedAt",k.expires_at as "expiresAt",k.revoked_at as "revokedAt",k.id::text as "cursorId",${sort === "name" ? "lower(k.name)" : sort === "expires" ? "k.expires_at::text" : "k.created_at::text"} as "cursorValue"
       from identity_capability.api_keys k join identity_capability.accounts a on a.id=k.account_id
       left join identity_capability.account_profiles p on p.id=a.id
       where ${conditions.join(" and ")}
       order by ${sort === "expires" ? "(k.expires_at is null) asc," : ""}${orderBy} ${direction} nulls last,k.id ${direction}
       limit $${values.length}`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    const toRecord = (row: (typeof rows)[number]) => {
      const { cursorId, cursorValue, ...record } = row;
      return {
        ...record,
        pageCursor: encodeCursor({ scope, sort, direction, value: cursorValue, id: cursorId }),
      };
    };
    return {
      items: visible.map(toRecord),
      nextCursor: rows.length > input.limit ? toRecord(visible.at(-1)!).pageCursor : null,
    };
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
  async update(
    id: string,
    input: {
      name: string;
      scopes: string[];
      expiresAt: Date | null;
      status?: "active" | "revoked";
    },
  ) {
    const result = await this.sql.query(
      `update identity_capability.api_keys set name=$2,scopes=$3::jsonb,expires_at=$4,
         revoked_at=case when $5='active' then null when $5='revoked' then coalesce(revoked_at,now()) else revoked_at end
       where uuid=$1`,
      [id, input.name, JSON.stringify(input.scopes), input.expiresAt, input.status ?? null],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async reassign(input: {
    id: string;
    accountId: string;
    name: string;
    keyPrefix: string;
    secretHash: Buffer;
    scopes: string[];
    expiresAt: Date | null;
    status: "active" | "revoked";
    secretCiphertext: Buffer;
    secretNonce: Buffer;
    secretAuthTag: Buffer;
    secretKeyVersion: number;
  }) {
    const result = await this.sql.query(
      `update identity_capability.api_keys set account_id=(select id from identity_capability.accounts where uuid=$2 and deleted_at is null),name=$3,key_prefix=$4,secret_hash=$5,secret_ciphertext=$6,secret_nonce=$7,secret_auth_tag=$8,secret_key_version=$9,scopes=$10::jsonb,expires_at=$11,revoked_at=case when $12='revoked' then coalesce(revoked_at,now()) else null end
       where uuid=$1 and exists(select 1 from identity_capability.accounts where uuid=$2 and deleted_at is null)`,
      [
        input.id,
        input.accountId,
        input.name,
        input.keyPrefix,
        input.secretHash,
        input.secretCiphertext,
        input.secretNonce,
        input.secretAuthTag,
        input.secretKeyVersion,
        JSON.stringify(input.scopes),
        input.expiresAt,
        input.status,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async delete(id: string, accountId?: string) {
    const result = await this.sql.query(
      `delete from identity_capability.api_keys where uuid=$1 and ($2::uuid is null or account_id=(select id from identity_capability.accounts where uuid=$2))`,
      [id, accountId ?? null],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async encryptedSecret(id: string) {
    const result = await this.sql.query<{
      secret_ciphertext: Buffer | null;
      secret_nonce: Buffer | null;
      secret_auth_tag: Buffer | null;
      secret_key_version: number | null;
    }>(
      `select secret_ciphertext,secret_nonce,secret_auth_tag,secret_key_version from identity_capability.api_keys where uuid=$1`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
export class ApiKeyService {
  constructor(
    private readonly repository: PostgresApiKeyRepository,
    private readonly sql: QueryExecutor,
    private readonly uow?: UnitOfWork,
    private readonly configuredEncryptionKey = process.env.API_KEY_ENCRYPTION_KEY,
  ) {}
  async create(input: {
    accountId: string;
    name: string;
    scopes: string[];
    createdBy: string;
    expiresAt?: Date | null;
    status?: "active" | "revoked";
  }) {
    const operation = async () => {
      const scopes = [...assertApiScopes(input.scopes)];
      const secret = `cliq_live_${randomBytes(32).toString("base64url")}`;
      const encrypted = encryptSecret(secret, this.encryptionKey());
      const prefix = secret.slice(0, 18);
      const inserted = await this.repository.insert({
        accountId: input.accountId,
        name: input.name.trim(),
        keyPrefix: prefix,
        secretHash: hash(secret),
        ...encrypted,
        scopes,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt ?? null,
        status: input.status ?? "active",
      });
      return {
        id: inserted.id,
        secret,
        name: input.name.trim(),
        scopes,
        keyPrefix: prefix,
        createdAt: inserted.created_at,
        expiresAt: inserted.expires_at,
        revokedAt: inserted.revoked_at,
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
  listPage(input: Parameters<PostgresApiKeyRepository["listPage"]>[0]) {
    return this.repository.listPage(input);
  }
  revoke(id: string, accountId?: string) {
    return this.repository.revoke(id, accountId);
  }
  find(id: string, accountId?: string) {
    return this.repository.findById(id, accountId);
  }
  update(
    id: string,
    input: {
      name: string;
      scopes: string[];
      expiresAt: Date | null;
      status?: "active" | "revoked";
    },
  ) {
    return this.repository.update(id, input);
  }
  async reassign(input: {
    id: string;
    accountId: string;
    name: string;
    scopes: string[];
    expiresAt: Date | null;
    status: "active" | "revoked";
  }) {
    const secret = `cliq_live_${randomBytes(32).toString("base64url")}`;
    const keyPrefix = secret.slice(0, 18);
    const operation = async () => {
      const changed = await this.repository.reassign({
        ...input,
        keyPrefix,
        secretHash: hash(secret),
        ...encryptSecret(secret, this.encryptionKey()),
      });
      return changed ? { secret, keyPrefix } : null;
    };
    return this.uow ? this.uow.transaction(operation) : operation();
  }
  delete(id: string, accountId?: string) {
    return this.repository.delete(id, accountId);
  }

  async reveal(id: string) {
    const encrypted = await this.repository.encryptedSecret(id);
    if (!encrypted?.secret_ciphertext || !encrypted.secret_nonce || !encrypted.secret_auth_tag)
      return null;
    return decryptSecret(
      encrypted.secret_ciphertext,
      encrypted.secret_nonce,
      encrypted.secret_auth_tag,
      this.encryptionKey(),
    );
  }

  private encryptionKey() {
    const configured = this.configuredEncryptionKey?.trim();
    if (!configured) {
      if (process.env.NODE_ENV === "test")
        return createHash("sha256").update("cliqero-test-api-key-encryption").digest();
      throw new PublicApplicationError(
        "API-key recovery encryption is not configured.",
        "configuration_error",
        500,
      );
    }
    try {
      const key = Buffer.from(configured, "base64");
      if (key.length !== 32) throw new Error();
      return key;
    } catch {
      throw new PublicApplicationError(
        "API-key recovery encryption is not configured correctly.",
        "configuration_error",
        500,
      );
    }
  }
}
function hash(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function encryptSecret(secret: string, key: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretCiphertext: ciphertext,
    secretNonce: nonce,
    secretAuthTag: cipher.getAuthTag(),
    secretKeyVersion: 1,
  };
}

function decryptSecret(ciphertext: Buffer, nonce: Buffer, authTag: Buffer, key: Buffer) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new PublicApplicationError(
      "API-key secret could not be recovered.",
      "secret_unavailable",
      409,
    );
  }
}
