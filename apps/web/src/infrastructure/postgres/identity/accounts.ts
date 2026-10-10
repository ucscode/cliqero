import { Account, type AccountReader } from "@/modules/identity/account";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import {
  DuplicateUsernameError,
  type AuthIdentityResolution,
  type IdentityPersistence,
  type ProfilePersistence,
} from "@/modules/identity/persistence";

interface AccountRow {
  id: string;
  username: string;
  country: string | null;
}

export class PostgresAccountRepository
  implements AccountReader, IdentityPersistence, ProfilePersistence
{
  constructor(private readonly sql: QueryExecutor) {}
  async exists(id: string): Promise<boolean> {
    return (
      (
        await this.sql.query(
          "select 1 from identity_capability.accounts where uuid = $1 and deleted_at is null",
          [id],
        )
      ).rowCount === 1
    );
  }
  async findById(id: string): Promise<Account | null> {
    const row = (
      await this.sql.query<AccountRow>(
        "select uuid as id, username, metadata->>'country' as country from identity_capability.accounts where uuid = $1 and deleted_at is null",
        [id],
      )
    ).rows[0];
    return row ? new Account(row.id, row.username, row.country) : null;
  }
  async findAuthenticationEmail(id: string): Promise<string | null> {
    const row = (
      await this.sql.query<{ email: string | null }>(
        "select email from identity_capability.account_profiles where uuid=$1",
        [id],
      )
    ).rows[0];
    return row?.email ?? null;
  }

  async removeUnlinkedAuthUser(email: string): Promise<void> {
    await this.sql.query(
      `delete from better_auth."user" u where lower(u.email)=lower($1)
       and not exists (select 1 from identity_capability.auth_account_links l where l.auth_user_id=u.id)`,
      [email],
    );
  }

  async createAccount(account: Account): Promise<void> {
    try {
      await this.sql.query(
        `insert into identity_capability.accounts (uuid,username,metadata)
         values ($1,$2,$3::jsonb)`,
        [
          account.id,
          account.username,
          JSON.stringify(account.country ? { country: account.country } : {}),
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateUsernameError();
      throw error;
    }
  }

  async linkCompletedAuthAccount(authUserId: string, accountId: string): Promise<boolean> {
    const linked = await this.sql.query(
      `update identity_capability.auth_account_links
       set account_id=(select id from identity_capability.accounts where uuid=$2),onboarding_state='complete',updated_at=now()
       where auth_user_id=$1 and onboarding_state='incomplete'`,
      [authUserId, accountId],
    );
    return linked.rowCount === 1;
  }

  async removeAuthUser(authUserId: string): Promise<void> {
    await this.sql.query(`delete from better_auth."user" where id=$1`, [authUserId]);
  }

  async removeAccountAuthIdentity(accountId: string): Promise<void> {
    await this.sql.query(
      `delete from better_auth.verification verification
       using identity_capability.auth_account_links link, better_auth."user" auth_user
       where link.account_id=(select id from identity_capability.accounts where uuid=$1)
         and auth_user.id=link.auth_user_id
         and (lower(verification.identifier)=lower(auth_user.email)
              or lower(verification.identifier) like '%:'||lower(auth_user.email))`,
      [accountId],
    );
    await this.sql.query(
      `delete from better_auth."user" auth_user
       using identity_capability.auth_account_links link
       where link.account_id=(select id from identity_capability.accounts where uuid=$1)
         and auth_user.id=link.auth_user_id`,
      [accountId],
    );
  }

  async resolveAuthIdentity(authUserId: string): Promise<AuthIdentityResolution> {
    const row = (
      await this.sql.query<{
        onboarding_state: string;
        id: string | null;
        username: string | null;
        country: string | null;
      }>(
        `select l.onboarding_state,a.uuid as id,a.username,a.metadata->>'country' as country
         from identity_capability.auth_account_links l
         left join identity_capability.accounts a on a.id=l.account_id and a.deleted_at is null
         where l.auth_user_id=$1`,
        [authUserId],
      )
    ).rows[0];
    if (!row) return { state: "missing", account: null };
    if (row.onboarding_state === "incomplete" && row.id === null)
      return { state: "incomplete", account: null };
    if (row.onboarding_state === "complete" && row.id && row.username)
      return { state: "complete", account: new Account(row.id, row.username, row.country) };
    return { state: "missing", account: null };
  }

  async authUserEmail(authUserId: string): Promise<string | null> {
    const row = (
      await this.sql.query<{ email: string }>(`select email from better_auth."user" where id=$1`, [
        authUserId,
      ])
    ).rows[0];
    return row?.email ?? null;
  }

  async accountEmailVerified(accountId: string): Promise<boolean> {
    const row = (
      await this.sql.query<{ verified: boolean }>(
        `select coalesce(auth_user."emailVerified", false) as verified
           from identity_capability.auth_account_links link
           join identity_capability.accounts account on account.id=link.account_id
           join better_auth."user" auth_user on auth_user.id=link.auth_user_id
          where account.uuid=$1 and account.deleted_at is null`,
        [accountId],
      )
    ).rows[0];
    return row?.verified ?? false;
  }

  async accountEmail(accountId: string): Promise<string | null> {
    const row = (
      await this.sql.query<{ email: string | null }>(
        `select auth_user.email
           from identity_capability.auth_account_links link
           join identity_capability.accounts account on account.id=link.account_id
           join better_auth."user" auth_user on auth_user.id=link.auth_user_id
          where account.uuid=$1 and account.deleted_at is null`,
        [accountId],
      )
    ).rows[0];
    return row?.email ?? null;
  }

  async authUserIdForAccount(accountId: string): Promise<string | null> {
    const row = (
      await this.sql.query<{ auth_user_id: string }>(
        `select link.auth_user_id
           from identity_capability.auth_account_links link
           join identity_capability.accounts account on account.id=link.account_id
          where account.uuid=$1 and account.deleted_at is null`,
        [accountId],
      )
    ).rows[0];
    return row?.auth_user_id ?? null;
  }

  async profileForAccount(accountId: string) {
    const row = (
      await this.sql.query<{
        email: string | null;
        username: string;
        display_name: string | null;
        country: string | null;
      }>(
        `select email,username,display_name,metadata->>'country' country
         from identity_capability.account_profiles where uuid=$1`,
        [accountId],
      )
    ).rows[0];
    return row
      ? {
          email: row.email,
          username: row.username,
          displayName: row.display_name,
          country: row.country,
        }
      : null;
  }

  async accountForProfileUpdate(accountId: string) {
    const row = (
      await this.sql.query<{ username: string; country: string | null }>(
        `select username,metadata->>'country' country
         from identity_capability.accounts where uuid=$1 and deleted_at is null`,
        [accountId],
      )
    ).rows[0];
    return row ?? null;
  }

  async updateProfile(account: Account): Promise<void> {
    try {
      await this.sql.query(
        `update identity_capability.accounts
         set username=$2,metadata=case when $3::text is null then metadata-'country'
           else jsonb_set(metadata,'{country}',to_jsonb($3::text),true) end,updated_at=now()
         where uuid=$1`,
        [account.id, account.username, account.country],
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateUsernameError();
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
