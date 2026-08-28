import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import type { UnitOfWork } from "@/kernel/unit-of-work";

export interface SqlExecutor {
  query<TRow extends QueryResultRow = QueryResultRow>(sql: string, values?: readonly unknown[]): Promise<QueryResult<TRow>>;
}

const transactionStorage = new AsyncLocalStorage<PoolClient>();

export class PostgresDatabase implements SqlExecutor, UnitOfWork {
  constructor(private readonly pool: Pool) {}

  static connect(connectionString: string): PostgresDatabase {
    return new PostgresDatabase(new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 }));
  }

  query<TRow extends QueryResultRow = QueryResultRow>(sql: string, values: readonly unknown[] = []): Promise<QueryResult<TRow>> {
    const executor = transactionStorage.getStore() ?? this.pool;
    return executor.query<TRow>(sql, [...values]);
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    if (transactionStorage.getStore()) return operation();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local statement_timeout = '10s'");
      const result = await transactionStorage.run(client, operation);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> { await this.pool.end(); }
}

