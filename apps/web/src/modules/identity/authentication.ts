import { APIError } from "better-auth";
import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
import { Account } from "./account";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { BetterAuthBoundary, type BetterAuthInstance } from "./better-auth";
import { assertPasswordMinimum } from "./password-policy";
import { normalizeUsername } from "./username";

interface AccountRow {
  id: string;
  username: string;
  country: string | null;
}

function normalizeCountry(country: string | null | undefined): string | null {
  if (country === undefined || country === null) return null;
  const normalized = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new Error("Country must be an ISO alpha-2 code");
  return normalized;
}

function accountFromRow(row: AccountRow): Account {
  return new Account(row.id, row.username, row.country);
}
function authHeaders(token: string): Headers {
  return new Headers({ authorization: `Bearer ${token}` });
}

/** Better Auth authentication mapped to Cliqero's canonical Account identity. */
export class AuthenticationService {
  readonly betterAuth: BetterAuthBoundary;
  readonly auth: BetterAuthInstance;

  constructor(
    private readonly sql: SqlExecutor,
    databaseUrl: string,
  ) {
    this.betterAuth = new BetterAuthBoundary(sql, databaseUrl);
    this.auth = this.betterAuth.auth;
  }

  private async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const database = this.sql as SqlExecutor & {
      transaction?<R>(fn: () => Promise<R>): Promise<R>;
    };
    return database.transaction ? database.transaction(operation) : operation();
  }

  async register(input: {
    email: string;
    username: string;
    password: string;
    country?: string | null;
  }): Promise<Account> {
    assertPasswordMinimum(input.password);
    const email = input.email.trim().toLowerCase();
    const username = normalizeUsername(input.username);
    const country = requireCountry(input.country);
    // A complete Cliqero identity always has a bridge row. An unlinked Better
    // Auth user is therefore an abandoned pre-provisioning artifact (for
    // example from an interrupted development attempt), never an OAuth user
    // awaiting username onboarding. Clearing only that invariant-violating
    // row keeps it from blocking a later legitimate registration.
    await this.sql.query(
      `delete from better_auth."user" u where lower(u.email)=lower($1)
       and not exists (select 1 from identity_capability.auth_account_links l where l.auth_user_id=u.id)`,
      [email],
    );
    let result;
    try {
      result = await this.auth.api.signUpEmail({
        // Better Auth requires the field structurally, but Cliqero collects no
        // display name during email registration. Keep it empty rather than
        // misrepresenting the username as a provider-owned display name.
        body: { name: "", email, password: input.password },
      });
    } catch {
      throw new PublicApplicationError(
        "We couldn’t create an account with those details.",
        "registration_failed",
      );
    }
    const account = new Account(newId(), username, country);
    try {
      await this.transaction(async () => {
        await this.sql.query(
          `insert into identity_capability.accounts (uuid,username,metadata)
           values ($1,$2,$3::jsonb)`,
          [account.id, account.username, JSON.stringify(country ? { country } : {})],
        );
        const linked = await this.sql.query(
          `update identity_capability.auth_account_links
           set account_id=(select id from identity_capability.accounts where uuid=$2),onboarding_state='complete',updated_at=now()
           where auth_user_id=$1 and onboarding_state='incomplete'`,
          [result.user.id, account.id],
        );
        if (linked.rowCount !== 1) throw new Error("Authentication onboarding state is invalid");
      });
      return account;
    } catch (error) {
      await this.sql.query(`delete from better_auth."user" where id=$1`, [result.user.id]);
      if ((error as { code?: string }).code === "23505")
        throw new PublicApplicationError("That username is already taken.", "username_taken", 409, {
          username: "That username is already taken.",
        });
      if (error instanceof PublicApplicationError) throw error;
      throw new PublicApplicationError(
        "We couldn’t create an account with those details.",
        "registration_failed",
      );
    }
  }

  async login(email: string, password: string): Promise<{ account: Account; token: string }> {
    let result;
    try {
      result = await this.auth.api.signInEmail({
        body: { email: email.trim().toLowerCase(), password },
      });
    } catch (error) {
      if (error instanceof APIError) throw new Error("Invalid credentials");
      throw error;
    }
    const account = await this.accountForAuthUser(result.user.id);
    if (!account) throw new Error("Account onboarding incomplete");
    if (!result.token) throw new Error("Authentication session unavailable");
    return { account, token: result.token };
  }

  async authenticate(token: string): Promise<Account | null> {
    if (!token || token.length > 500) return null;
    try {
      const session = await this.auth.api.getSession({ headers: authHeaders(token) });
      return session?.user ? this.accountForAuthUser(session.user.id) : null;
    } catch {
      return null;
    }
  }

  async authenticateRequest(request: Request): Promise<Account | null> {
    try {
      const session = await this.auth.api.getSession({ headers: request.headers });
      return session?.user ? this.accountForAuthUser(session.user.id) : null;
    } catch {
      return null;
    }
  }

  async accountForAuthUser(authUserId: string): Promise<Account | null> {
    const row = (
      await this.sql.query<AccountRow>(
        `select a.uuid as id,a.username,a.metadata->>'country' as country
       from identity_capability.auth_account_links l
       join identity_capability.accounts a on a.id=l.account_id
       where l.auth_user_id=$1 and l.onboarding_state='complete'`,
        [authUserId],
      )
    ).rows[0];
    return row ? accountFromRow(row) : null;
  }

  async principal(
    request: Request,
  ): Promise<{ authUserId: string; account: Account | null } | null> {
    try {
      const session = await this.auth.api.getSession({ headers: request.headers });
      if (!session?.user) return null;
      return {
        authUserId: session.user.id,
        account: await this.accountForAuthUser(session.user.id),
      };
    } catch {
      return null;
    }
  }

  async authUserEmail(authUserId: string): Promise<string | null> {
    const row = (
      await this.sql.query<{ email: string }>(`select email from better_auth."user" where id=$1`, [
        authUserId,
      ])
    ).rows[0];
    return row?.email ?? null;
  }

  async resetPassword(authUserId: string, newPassword: string): Promise<void> {
    await this.betterAuth.resetPassword(authUserId, newPassword);
  }

  async hasPasswordCredential(authUserId: string): Promise<boolean> {
    return this.betterAuth.hasPasswordCredential(authUserId);
  }

  async completeOnboarding(
    authUserId: string,
    input: { username: string; country?: string | null; password?: string },
    headers?: Headers,
  ): Promise<Account> {
    const country = requireCountry(input.country);
    const hasPassword = await this.betterAuth.hasPasswordCredential(authUserId);
    if (!hasPassword && !input.password)
      throw new PublicApplicationError(
        "Choose a password to finish setting up your account.",
        "validation_error",
        400,
        { password: "Choose a password to finish setting up your account." },
      );
    let createdCredentialId: string | null = null;
    if (!hasPassword && input.password) {
      assertPasswordMinimum(input.password);
      if (!headers)
        throw new Error("An authenticated request is required to create a local password");
      createdCredentialId = await this.betterAuth.setPassword(authUserId, input.password, headers);
    }
    const account = new Account(newId(), normalizeUsername(input.username), country);
    try {
      await this.transaction(async () => {
        await this.sql.query(
          `insert into identity_capability.accounts (uuid,username,metadata)
           values ($1,$2,$3::jsonb)`,
          [account.id, account.username, JSON.stringify(country ? { country } : {})],
        );
        const updated = await this.sql.query(
          `update identity_capability.auth_account_links
           set account_id=(select id from identity_capability.accounts where uuid=$2),onboarding_state='complete',updated_at=now()
           where auth_user_id=$1 and onboarding_state='incomplete'`,
          [authUserId, account.id],
        );
        if (updated.rowCount !== 1) throw new Error("Authentication onboarding state is invalid");
      });
      return account;
    } catch (error) {
      if (createdCredentialId)
        await this.betterAuth.removePasswordCredential(authUserId, createdCredentialId);
      if ((error as { code?: string }).code === "23505")
        throw new PublicApplicationError("That username is already taken.", "username_taken", 409, {
          username: "That username is already taken.",
        });
      throw error;
    }
  }
}

function requireCountry(country: string | null | undefined): string {
  const normalized = normalizeCountry(country);
  if (!normalized)
    throw new PublicApplicationError("Choose a country to continue.", "validation_error", 400, {
      country: "Choose a country to continue.",
    });
  return normalized;
}

/** Kept for machine integration credentials; user sessions use Better Auth. */
export function bearerCredential(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}
