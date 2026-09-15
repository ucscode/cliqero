import type { QueryResult, QueryResultRow } from "pg";

/** Minimal query contract shared across domain ports and infrastructure adapters. */
export interface SqlExecutor {
  query<TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
}
