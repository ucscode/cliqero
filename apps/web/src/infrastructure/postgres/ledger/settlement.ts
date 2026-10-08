import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { newId } from "@/kernel/ids";
import type { MaturedLedgerEntry, SettlementStore } from "@/processors/ledger/contracts";

export class PostgresSettlementStore implements SettlementStore {
  constructor(private readonly sql: QueryExecutor) {}

  async claimMatured(input: {
    now: Date;
    batchSize: number;
  }): Promise<readonly MaturedLedgerEntry[]> {
    const rows = await this.sql.query<MaturedLedgerEntry>(
      `select entry.uuid as id,entry.id::text as "relationalId",account.uuid as "accountId",
              case when entry.entry_type='purchase-earnings' and entry.direction='credit'
                     then greatest(0,entry.amount_minor-coalesce((select sum(correction.pending_minor)
                       from ledger_capability.earnings_corrections correction
                      where correction.source_entry_id=entry.id),0))
                   else entry.amount_minor end::text as "amountMinor",entry.entry_type as "entryType",
              entry.recipient_role as "recipientRole",entry.correlation_id as "correlationId"
         from ledger_capability.entries entry
         left join identity_capability.accounts account on account.id=entry.account_id
         left join ledger_capability.entry_settlements settlement on settlement.original_entry_id=entry.id
        where entry.balance_state='pending' and entry.maturity_at is not null and entry.maturity_at <= $1
          and settlement.id is null
        order by entry.maturity_at,entry.id limit $2 for update of entry skip locked`,
      [input.now, input.batchSize],
    );
    return rows.rows;
  }

  async recordSettlements(
    entries: readonly MaturedLedgerEntry[],
    settledAt: Date,
  ): Promise<number> {
    if (entries.length === 0) return 0;
    const values = entries
      .map(
        (_, index) =>
          `($${index * 3 + 1}::uuid,$${index * 3 + 2}::bigint,'pending','available',$${index * 3 + 3},$${entries.length * 3 + 1})`,
      )
      .join(",");
    const params: unknown[] = entries.flatMap((entry) => [
      newId(),
      entry.relationalId,
      `settlement:${entry.id}`,
    ]);
    params.push(settledAt);
    const result = await this.sql.query(
      `insert into ledger_capability.entry_settlements(uuid,original_entry_id,from_state,to_state,idempotency_key,settled_at)
       values ${values} on conflict(original_entry_id) do nothing`,
      params,
    );
    return result.rowCount ?? 0;
  }
}
