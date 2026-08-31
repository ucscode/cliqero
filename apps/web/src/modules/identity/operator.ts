import type { SqlExecutor } from "@/infrastructure/postgres/database";

export class OperatorAuthorizationService {
  constructor(private readonly sql: SqlExecutor) {}
  async requireOperator(accountId: string): Promise<void> {
    const allowed =
      (
        await this.sql.query(
          `select 1 from identity_capability.account_capabilities where account_id=$1 and capability='operator'`,
          [accountId],
        )
      ).rowCount === 1;
    if (!allowed) throw new Error("Forbidden");
  }
  async requireCatalogueManager(accountId: string): Promise<void> {
    const allowed =
      (
        await this.sql.query(
          `select 1 from identity_capability.account_capabilities where account_id=$1 and capability in ('operator','catalogue_manager')`,
          [accountId],
        )
      ).rowCount === 1;
    if (!allowed) throw new Error("Forbidden");
  }
}
