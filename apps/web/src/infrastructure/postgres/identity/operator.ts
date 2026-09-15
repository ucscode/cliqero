import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";

export class PostgresOperatorAuthorizationService implements OperatorAuthorizationService {
  constructor(private readonly sql: QueryExecutor) {}
  async capabilities(accountId: string): Promise<readonly Capability[]> {
    const result = await this.sql.query<{ capability: string }>(
      `select capability from identity_capability.account_capabilities where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [accountId],
    );
    return result.rows.map((row) => row.capability as Capability);
  }

  async hasCapability(accountId: string, capability: Capability | string): Promise<boolean> {
    return hasCapability(await this.capabilities(accountId), capability);
  }

  async requireCapability(accountId: string, capability: Capability): Promise<void> {
    if (!(await this.hasCapability(accountId, capability))) throw new Error("Forbidden");
  }
}
