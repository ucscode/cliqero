import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { newId, type Id } from "@/kernel/ids";
import type { IntegrationPrincipal } from "./access";
import type { SqlExecutor } from "@/infrastructure/postgres/database";

const hashCredential=(salt:Buffer,secret:string)=>createHash("sha256").update(salt).update(secret,"utf8").digest();
interface IntegrationRow { id:string; owner_id:string; credential_hash:Buffer; credential_salt:Buffer; state:"active"|"revoked"; }

export class ScopedIntegration implements IntegrationPrincipal {
  constructor(readonly id:Id,readonly ownerId:Id,private readonly listingIds:ReadonlySet<Id>) {}
  canVerifyListing(listingId:Id):boolean { return this.listingIds.has(listingId); }
}

export class IntegrationService {
  constructor(private readonly sql:SqlExecutor) {}
  async create(ownerId:Id,name:string,listingId:Id):Promise<{id:Id;credential:string}> {
    const id=newId(); const secret=randomBytes(32).toString("base64url"); const salt=randomBytes(16);
    await this.sql.query(
      `insert into access_capability.integrations (id,owner_id,name,credential_hash,credential_salt)
       values ($1,$2,$3,$4,$5)`,[id,ownerId,name.trim(),hashCredential(salt,secret),salt]);
    await this.sql.query(
      `insert into access_capability.integration_listings (integration_id,listing_id) values ($1,$2)`,[id,listingId]);
    return {id,credential:`cli_int_${id}.${secret}`};
  }
  async authenticate(credential:string):Promise<ScopedIntegration|null> {
    const match=/^cli_int_([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(credential);
    if (!match) return null;
    const row=(await this.sql.query<IntegrationRow>(
      `select id,owner_id,credential_hash,credential_salt,state from access_capability.integrations where id=$1`,[match[1]])).rows[0];
    if (!row || row.state!=="active") return null;
    const candidate=hashCredential(row.credential_salt,match[2]);
    if (candidate.length!==row.credential_hash.length || !timingSafeEqual(candidate,row.credential_hash)) return null;
    const listingRows=(await this.sql.query<{listing_id:string}>(
      `select listing_id from access_capability.integration_listings where integration_id=$1`,[row.id])).rows;
    return new ScopedIntegration(row.id,row.owner_id,new Set(listingRows.map(item=>item.listing_id)));
  }
}

