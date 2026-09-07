import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { Account } from "@/modules/identity/account";
import { normalizeUsername } from "@/modules/identity/username";
export class ProfileService {
  constructor(private sql: SqlExecutor) {}
  async update(id: string, input: { email?: string; username?: string; country?: string | null }) {
    const current = (
      await this.sql.query<any>(
        `select email,username,display_name,metadata->>'country' country from identity_capability.accounts where uuid=$1`,
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
      input.email ?? current.email,
      input.username !== undefined ? normalizeUsername(input.username) : current.username,
      normalizedCountry,
      current.display_name,
    );
    try {
      await this.sql.query(
        `update identity_capability.accounts set email=$2,username=$3,metadata=case when $4::text is null then metadata-'country' else jsonb_set(metadata,'{country}',to_jsonb($4::text),true) end,updated_at=now() where uuid=$1`,
        [id, account.email, account.username, account.country],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new Error("That username is already in use");
      throw error;
    }
    return account;
  }
}
