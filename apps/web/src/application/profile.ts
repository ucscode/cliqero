import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { Account } from "@/modules/identity/account";
export class ProfileService {
  constructor(private sql: SqlExecutor) {}
  async update(id: string, input: { email?: string; handle?: string; country?: string | null }) {
    const current = (
      await this.sql.query<any>(
        `select email,handle,metadata->>'country' country from identity_capability.accounts where id=$1`,
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
      input.handle?.trim().toLowerCase() ?? current.handle,
      normalizedCountry,
    );
    try {
      await this.sql.query(
        `update identity_capability.accounts set email=$2,handle=$3,metadata=case when $4::text is null then metadata-'country' else jsonb_set(metadata,'{country}',to_jsonb($4::text),true) end,updated_at=now() where id=$1`,
        [id, account.email, account.handle, account.country],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new Error("That handle is already in use");
      throw error;
    }
    return account;
  }
}
