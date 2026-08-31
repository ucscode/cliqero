import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import type {SqlExecutor} from "./database";
import {assertApiScopes} from "@/modules/identity/api-scopes";

export interface ApiKeyRecord {id:string;accountId:string;name:string;keyPrefix:string;scopes:string[];createdAt:Date;lastUsedAt:Date|null;expiresAt:Date|null;revokedAt:Date|null;}
export class PostgresApiKeyRepository {
  constructor(private readonly sql:SqlExecutor){}
  async insert(input:{accountId:string;name:string;keyPrefix:string;secretHash:Buffer;scopes:string[];createdBy:string;expiresAt:Date|null}){const id=(await this.sql.query<{id:string}>(`insert into identity_capability.api_keys(account_id,name,key_prefix,secret_hash,scopes,created_by,expires_at) values($1,$2,$3,$4,$5::jsonb,$6,$7) returning id`,[input.accountId,input.name,input.keyPrefix,input.secretHash,JSON.stringify(input.scopes),input.createdBy,input.expiresAt])).rows[0].id;return id;}
  async findActiveByPrefix(prefix:string){const row=(await this.sql.query<{id:string;account_id:string;name:string;key_prefix:string;secret_hash:Buffer;scopes:string[];created_at:Date;last_used_at:Date|null;expires_at:Date|null;revoked_at:Date|null}>(`select id,account_id,name,key_prefix,secret_hash,scopes,created_at,last_used_at,expires_at,revoked_at from identity_capability.api_keys where key_prefix=$1 and revoked_at is null and (expires_at is null or expires_at>now())`,[prefix])).rows[0];return row;}
  async touch(id:string){await this.sql.query(`update identity_capability.api_keys set last_used_at=now() where id=$1`,[id]);}
  async list(){const rows=await this.sql.query<ApiKeyRecord>(`select id,account_id as "accountId",name,key_prefix as "keyPrefix",scopes,created_at as "createdAt",last_used_at as "lastUsedAt",expires_at as "expiresAt",revoked_at as "revokedAt" from identity_capability.api_keys order by created_at desc,id desc`);return rows.rows;}
  async revoke(id:string){await this.sql.query(`update identity_capability.api_keys set revoked_at=coalesce(revoked_at,now()) where id=$1`,[id]);}
}
export class ApiKeyService {
  constructor(private readonly repository:PostgresApiKeyRepository,private readonly sql:SqlExecutor){}
  async create(input:{accountId:string;name:string;scopes:string[];createdBy:string;expiresAt?:Date|null}){const scopes=[...assertApiScopes(input.scopes)];const secret=`cliq_live_${randomBytes(32).toString("base64url")}`;const prefix=secret.slice(0,18);const id=await this.repository.insert({accountId:input.accountId,name:input.name.trim(),keyPrefix:prefix,secretHash:hash(secret),scopes,createdBy:input.createdBy,expiresAt:input.expiresAt??null});return {id,secret,name:input.name.trim(),scopes};}
  async authenticate(secret:string){if(!secret.startsWith("cliq_live_")||secret.length>200)return null;const prefix=secret.slice(0,18);const row=await this.repository.findActiveByPrefix(prefix);if(!row)return null;const actual=hash(secret);if(actual.length!==row.secret_hash.length||!timingSafeEqual(actual,row.secret_hash))return null;await this.repository.touch(row.id);return {id:row.id,accountId:row.account_id,name:row.name,scopes:row.scopes};}
  list(){return this.repository.list();} revoke(id:string){return this.repository.revoke(id);}
}
function hash(secret:string){return createHash("sha256").update(secret).digest();}
