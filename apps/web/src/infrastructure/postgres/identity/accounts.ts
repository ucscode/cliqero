import { Account, type AccountReader } from "@/modules/identity/account";
import type { SqlExecutor } from "../shared/database";

interface AccountRow {
  id: string;
  username: string;
  country: string | null;
}

export class PostgresAccountRepository implements AccountReader {
  constructor(private readonly sql: SqlExecutor) {}
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
}
