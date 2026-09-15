import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { QueryExecutor, QueryResult } from "@/kernel/database";

export type { QueryExecutor, QueryResult } from "@/kernel/database";

const transactionStorage = new AsyncLocalStorage<PoolClient>();

export class PostgresDatabase implements QueryExecutor, UnitOfWork {
  constructor(private readonly pool: Pool) {
    // pg emits idle-client connection errors on the pool itself when
    // PostgreSQL disappears. Keep the process alive so callers can observe the
    // failure and the worker retry loop can reconnect on a later iteration.
    this.pool.on("error", () => undefined);
  }

  static connect(connectionString: string): PostgresDatabase {
    return new PostgresDatabase(
      new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }),
    );
  }

  async query<TRow extends object = Record<string, unknown>>(
    statement: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<TRow>> {
    const executor = transactionStorage.getStore() ?? this.pool;
    const result = await executor.query<TRow & QueryResultRow>(statement, [...values]);
    return { rows: result.rows as TRow[], rowCount: result.rowCount };
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}
