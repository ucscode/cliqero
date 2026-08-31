import { newId } from "@/kernel/ids";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import type { TreasuryRepository } from "@/modules/treasury/treasury";
export class TreasuryProcessor {
  constructor(
    private sql: SqlExecutor,
    private treasury: TreasuryRepository,
  ) {}
  async findWork(limit = 50) {
    return (
      await this.sql.query<{ id: string }>(
        `select d.id from ledger_capability.purchase_distributions d left join treasury_capability.entries t on t.source_kind='distribution' and t.source_id=d.id where d.platform_amount_minor>0 and t.id is null order by d.completed_at,d.id limit $1`,
        [limit],
      )
    ).rows;
  }
  async process(distributionId: string) {
    const row = (
      await this.sql.query<{ id: string; amount: string }>(
        `select id,platform_amount_minor amount from ledger_capability.purchase_distributions where id=$1`,
        [distributionId],
      )
    ).rows[0];
    if (!row || BigInt(row.amount) <= 0n) return null;
    return this.treasury.create({
      id: newId(),
      direction: "credit",
      amountMinor: BigInt(row.amount),
      title: "Platform allocation",
      note: "Automatic allocation from completed purchase distribution",
      sourceKind: "distribution",
      sourceId: row.id,
      idempotencyKey: `treasury:distribution:${row.id}:platform`,
      actorId: null,
      createdAt: new Date(),
    });
  }
}
