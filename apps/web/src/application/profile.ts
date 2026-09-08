import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { Account } from "@/modules/identity/account";
import { PublicApplicationError } from "@/kernel/errors";
import { normalizeUsername } from "@/modules/identity/username";
export class ProfileService {
  constructor(private sql: SqlExecutor) {}
  async get(id: string) {
    const profile = (
      await this.sql.query<{
        email: string | null;
        username: string;
        display_name: string | null;
        country: string | null;
      }>(
        `select email,username,display_name,metadata->>'country' country
           from identity_capability.account_profiles where uuid=$1`,
        [id],
      )
    ).rows[0];
    if (!profile?.email) throw new Error("Authentication identity not found");
    return {
      email: profile.email,
      username: profile.username,
      displayName: profile.display_name,
      country: profile.country,
    };
  }
  async update(id: string, input: { username?: string; country?: string | null }) {
    const current = (
      await this.sql.query<any>(
        `select username,metadata->>'country' country from identity_capability.accounts where uuid=$1`,
        [id],
      )
    ).rows[0];
    if (!current) throw new Error("Account not found");
    const country = input.country === undefined ? current.country : input.country;
    const normalizedCountry = country === null ? null : country.trim().toUpperCase();
    if (normalizedCountry !== null && !/^[A-Z]{2}$/.test(normalizedCountry))
      throw new Error("Country must be an ISO alpha-2 code");
    const account = new Account(
      id,
      input.username !== undefined ? normalizeUsername(input.username) : current.username,
      normalizedCountry,
    );
    try {
      await this.sql.query(
        `update identity_capability.accounts set username=$2,metadata=case when $3::text is null then metadata-'country' else jsonb_set(metadata,'{country}',to_jsonb($3::text),true) end,updated_at=now() where uuid=$1`,
        [id, account.username, account.country],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new PublicApplicationError("That username is already taken.", "username_taken", 409, {
          username: "That username is already taken.",
        });
      throw error;
    }
    return account;
  }
}
