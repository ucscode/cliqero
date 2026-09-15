import type {
  WithdrawalPersistence,
  WithdrawalPayoutState,
} from "@/application/withdrawal/contracts";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { UnitOfWork } from "@/kernel/unit-of-work";

export class PostgresWithdrawalPersistence implements WithdrawalPersistence {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sql: QueryExecutor,
  ) {}

  withIdempotencyLock<T>(idempotencyKey: string, operation: () => Promise<T>): Promise<T> {
    return this.uow.transaction(async () => {
      await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [
        `withdrawal:idempotency:${idempotencyKey}`,
      ]);
      return operation();
    });
  }

  async findPayoutState(withdrawalId: string): Promise<WithdrawalPayoutState | null> {
    const result = await this.sql.query<{ state: string; attempt_state: string | null }>(
      `select e.state, a.state attempt_state
         from payout_capability.executions e
         left join lateral (
           select state from payout_capability.attempts
            where execution_id=e.id order by attempt_number desc limit 1
         ) a on true
        where e.withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1)
        for update of e`,
      [withdrawalId],
    );
    const row = result.rows[0];
    return row ? { state: row.state, attemptState: row.attempt_state } : null;
  }
}
