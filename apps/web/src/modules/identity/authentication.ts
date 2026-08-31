import { APIError } from "better-auth";
import { newId } from "@/kernel/ids";
import { Account } from "./account";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { BetterAuthBoundary, type BetterAuthInstance } from "./better-auth";

interface AccountRow { id:string; email:string; handle:string; country:string|null; }

function normalizeCountry(country:string|null|undefined):string|null {
  if (country === undefined || country === null) return null;
  const normalized = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new Error("Country must be an ISO alpha-2 code");
  return normalized;
}

function accountFromRow(row:AccountRow):Account { return new Account(row.id,row.email,row.handle,row.country); }
function authHeaders(token:string):Headers { return new Headers({authorization:`Bearer ${token}`}); }

/** Better Auth authentication mapped to Cliqero's canonical Account identity. */
export class AuthenticationService {
  readonly betterAuth: BetterAuthBoundary;
  readonly auth: BetterAuthInstance;

  constructor(private readonly sql:SqlExecutor, databaseUrl:string) {
    this.betterAuth = new BetterAuthBoundary(sql,databaseUrl);
    this.auth = this.betterAuth.auth;
  }

  private async transaction<T>(operation:()=>Promise<T>):Promise<T> {
    const database=this.sql as SqlExecutor & {transaction?<R>(fn:()=>Promise<R>):Promise<R>};
    return database.transaction ? database.transaction(operation) : operation();
  }

  async register(input:{email:string;handle:string;password:string;country?:string|null}):Promise<Account> {
    if (input.password.length < 12) throw new Error("Password must contain at least 12 characters");
    const email=input.email.trim().toLowerCase();
    const handle=input.handle.trim().toLowerCase();
    const country=normalizeCountry(input.country);
    // A prior test/development reset may have deleted the Cliqero account but
    // left its unlinked Better Auth user. It is safe to clean only such rows;
    // incomplete OAuth users remain mapped and are never removed here.
    await this.sql.query(
      `delete from better_auth."user" u where lower(u.email)=lower($1)
       and not exists (select 1 from identity_capability.auth_account_links l where l.auth_user_id=u.id)`,[email]);
    const result=await this.auth.api.signUpEmail({body:{name:handle,email,password:input.password}});
    const account = new Account(newId(),email,handle,country);
    try {
      await this.transaction(async()=>{
        await this.sql.query(
          `insert into identity_capability.accounts (id,email,handle,metadata)
           values ($1,$2,$3,$4::jsonb)`,
          [account.id,account.email,account.handle,JSON.stringify(country?{country}: {})]);
        const linked=await this.sql.query(
          `update identity_capability.auth_account_links
           set account_id=$2,onboarding_state='complete',updated_at=now()
           where auth_user_id=$1 and onboarding_state='incomplete'`,[result.user.id,account.id]);
        if (linked.rowCount!==1) throw new Error("Authentication onboarding state is invalid");
      });
      return account;
    } catch (error) {
      await this.sql.query(`delete from better_auth."user" where id=$1`,[result.user.id]);
      throw error;
    }
  }

  async login(email:string,password:string):Promise<{account:Account;token:string}> {
    let result;
    try {
      result=await this.auth.api.signInEmail({body:{email:email.trim().toLowerCase(),password}});
    } catch (error) {
      if (error instanceof APIError) throw new Error("Invalid credentials");
      throw error;
    }
    const account=await this.accountForAuthUser(result.user.id);
    if (!account) throw new Error("Account onboarding incomplete");
    if (!result.token) throw new Error("Authentication session unavailable");
    return {account,token:result.token};
  }

  async authenticate(token:string):Promise<Account|null> {
    if (!token || token.length>500) return null;
    try {
      const session=await this.auth.api.getSession({headers:authHeaders(token)});
      return session?.user ? this.accountForAuthUser(session.user.id) : null;
    } catch { return null; }
  }

  async authenticateRequest(request:Request):Promise<Account|null> {
    try {
      const session=await this.auth.api.getSession({headers:request.headers});
      return session?.user ? this.accountForAuthUser(session.user.id) : null;
    } catch { return null; }
  }

  async accountForAuthUser(authUserId:string):Promise<Account|null> {
    const row=(await this.sql.query<AccountRow>(
      `select a.id,a.email,a.handle,a.metadata->>'country' as country
       from identity_capability.auth_account_links l
       join identity_capability.accounts a on a.id=l.account_id
       where l.auth_user_id=$1 and l.onboarding_state='complete'`,[authUserId])).rows[0];
    return row ? accountFromRow(row) : null;
  }

  async principal(request:Request):Promise<{authUserId:string;account:Account|null}|null> {
    try {
      const session=await this.auth.api.getSession({headers:request.headers});
      if (!session?.user) return null;
      return {authUserId:session.user.id,account:await this.accountForAuthUser(session.user.id)};
    } catch { return null; }
  }

  async authUserEmail(authUserId:string):Promise<string|null> {
    const row=(await this.sql.query<{email:string}>(`select email from better_auth."user" where id=$1`,[authUserId])).rows[0];
    return row?.email ?? null;
  }

  async completeOnboarding(authUserId:string,input:{email:string;handle:string;country?:string|null}):Promise<Account> {
    const country=normalizeCountry(input.country);
    const account=new Account(newId(),input.email.trim().toLowerCase(),input.handle.trim().toLowerCase(),country);
    await this.transaction(async()=>{
      await this.sql.query(
        `insert into identity_capability.accounts (id,email,handle,metadata)
         values ($1,$2,$3,$4::jsonb)`,
        [account.id,account.email,account.handle,JSON.stringify(country?{country}: {})]);
      const updated=await this.sql.query(
        `update identity_capability.auth_account_links
         set account_id=$2,onboarding_state='complete',updated_at=now()
         where auth_user_id=$1 and onboarding_state='incomplete'`,[authUserId,account.id]);
      if (updated.rowCount!==1) throw new Error("Authentication onboarding state is invalid");
    });
    return account;
  }
}

/** Kept for machine integration credentials; user sessions use Better Auth. */
export function bearerCredential(request:Request):string|null {
  const authorization=request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token=authorization.slice(7).trim();
  return token || null;
}
