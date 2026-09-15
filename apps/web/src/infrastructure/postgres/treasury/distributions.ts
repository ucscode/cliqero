import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { TreasuryDistributionStore } from "@/processors/treasury/contracts";

export class PostgresTreasuryDistributionStore implements TreasuryDistributionStore {
  constructor(private readonly sql: QueryExecutor) {}

  async findWork(limit: number) {
    return (
      await this.sql.query<{ id: string }>(
        `select d.uuid as id from ledger_capability.purchase_distributions d left join treasury_capability.entries t on t.source_kind='distribution' and t.source_id=d.uuid where d.platform_amount_minor>0 and t.id is null order by d.completed_at,d.id limit $1`,
        [limit],
      )
    ).rows;
  }

  async findAmount(distributionId: string) {
    const row = (
      await this.sql.query<{ id: string; amount: string }>(
        `select uuid as id,platform_amount_minor amount from ledger_capability.purchase_distributions where uuid=$1`,
        [distributionId],
      )
    ).rows[0];
    return row ? { id: row.id, amountMinor: row.amount } : null;
  }
}
