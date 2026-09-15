import { newId } from "@/kernel/ids";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { SettlementResult } from "@/modules/ledger/settlement";
import type { SettlementStore } from "@/processors/ledger/contracts";

export class PostgresSettlementStore implements SettlementStore {
  constructor(
    private readonly sql: QueryExecutor,
    private readonly uow: UnitOfWork,
  ) {}

  async settleMatured(input: { now: Date; batchSize: number }): Promise<SettlementResult> {
    return this.uow.transaction(async () => {
      const rows = await this.sql.query<{ id: string; relational_id: string }>(
        `select entry.uuid as id,entry.id as relational_id from ledger_capability.entries entry
        left join ledger_capability.entry_settlements settlement on settlement.original_entry_id=entry.id
        where entry.balance_state='pending' and entry.maturity_at is not null and entry.maturity_at <= $1 and settlement.id is null
        order by entry.maturity_at,entry.id limit $2 for update of entry skip locked`,
        [input.now, input.batchSize],
      );
      const ids = rows.rows.map(() => newId());
      const values = rows.rows
        .map(
          (row, index) =>
            `($${index * 3 + 1}::uuid,$${index * 3 + 2},'pending','available',$${index * 3 + 3},$${rows.rows.length * 3 + 1})`,
        )
        .join(",");
      if (!values) return { claimed: rows.rowCount ?? 0, settled: 0 };
      const params: unknown[] = rows.rows.flatMap((row, index) => [
        ids[index],
        row.relational_id,
        `settlement:${row.id}`,
      ]);
      params.push(input.now);
      const bulk = await this.sql.query(
        `insert into ledger_capability.entry_settlements(uuid,original_entry_id,from_state,to_state,idempotency_key,settled_at) values ${values} on conflict(original_entry_id) do nothing`,
        params,
      );
      return { claimed: rows.rowCount ?? 0, settled: bulk.rowCount ?? 0 };
    });
  }
}
