import type { WithdrawalPersistence } from "@/application/withdrawal/contracts";
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
}
