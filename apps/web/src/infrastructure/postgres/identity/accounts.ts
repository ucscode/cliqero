import { Account, type AccountReader } from "@/modules/identity/account";
import type { QueryExecutor } from "@/kernel/database";
import {
  DuplicateUsernameError,
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
      (await this.sql.query("select 1 from identity_capability.accounts where uuid = $1", [id]))
        .rowCount === 1
    );
  }
  async findById(id: string): Promise<Account | null> {
    const row = (
      await this.sql.query<AccountRow>(
        "select uuid as id, username, metadata->>'country' as country from identity_capability.accounts where uuid = $1",
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
    return row ? new Account(row.id, row.username, row.country) : null;
  }

  async authUserEmail(authUserId: string): Promise<string | null> {
    const row = (
      await this.sql.query<{ email: string }>(`select email from better_auth."user" where id=$1`, [
        authUserId,
      ])
    ).rows[0];
    return row?.email ?? null;
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
         from identity_capability.accounts where uuid=$1`,
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
