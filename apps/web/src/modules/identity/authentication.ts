import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { newId } from "@/kernel/ids";
import { Account } from "./account";
import type { SqlExecutor } from "@/infrastructure/postgres/database";

const scrypt = promisify(scryptCallback);
const credentialHash = (value:string) => createHash("sha256").update(value,"utf8").digest();

interface CredentialRow { id:string; email:string; handle:string; password_salt:Buffer; password_hash:Buffer; }
export class AuthenticationService {
  constructor(private readonly sql:SqlExecutor) {}

  async register(input:{email:string;handle:string;password:string;country?:string|null}):Promise<Account> {
    if (input.password.length < 12) throw new Error("Password must contain at least 12 characters");
    const country=input.country===undefined||input.country===null?null:input.country.trim().toUpperCase(); if(country!==null&&!/^[A-Z]{2}$/.test(country))throw new Error("Country must be an ISO alpha-2 code");
    const account = new Account(newId(), input.email.trim().toLowerCase(), input.handle.trim().toLowerCase(),country);
    const salt=randomBytes(16);
    const hash=Buffer.from(await scrypt(input.password,salt,64) as Buffer);
    await this.sql.query(
      `insert into identity_capability.accounts (id,email,handle,metadata,password_salt,password_hash)
       values ($1,$2,$3,$4::jsonb,$5,$6)`,[account.id,account.email,account.handle,JSON.stringify(account.country?{country:account.country}:{}),salt,hash]);
    return account;
  }

  async login(email:string,password:string):Promise<{account:Account;token:string}> {
    const row=(await this.sql.query<CredentialRow>(
      `select id,email,handle,password_salt,password_hash,metadata->>'country' as country from identity_capability.accounts where email=$1`,[email.trim().toLowerCase()])).rows[0];
    if (!row?.password_salt || !row.password_hash) throw new Error("Invalid credentials");
    const candidate=Buffer.from(await scrypt(password,row.password_salt,64) as Buffer);
    if (candidate.length!==row.password_hash.length || !timingSafeEqual(candidate,row.password_hash)) throw new Error("Invalid credentials");
    const token=randomBytes(32).toString("base64url");
    await this.sql.query(
      `insert into identity_capability.sessions (account_id,token_hash) values ($1,$2)`,[row.id,credentialHash(token)]);
    return {account:new Account(row.id,row.email,row.handle,(row as CredentialRow&{country:string|null}).country??null),token};
  }

  async authenticate(token:string):Promise<Account|null> {
    if (!token || token.length>200) return null;
    const row=(await this.sql.query<CredentialRow>(
      `select account.id,account.email,account.handle,account.password_salt,account.password_hash,account.metadata->>'country' as country
       from identity_capability.sessions session
       join identity_capability.accounts account on account.id=session.account_id
       where session.token_hash=$1 and session.state='active'`,[credentialHash(token)])).rows[0];
    if (!row) return null;
    await this.sql.query(`update identity_capability.sessions set last_used_at=now() where token_hash=$1`,[credentialHash(token)]);
    return new Account(row.id,row.email,row.handle,(row as CredentialRow&{country:string|null}).country??null);
  }
}

export function bearerCredential(request:Request):string|null {
  const authorization=request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token=authorization.slice(7).trim();
  return token || null;
}
