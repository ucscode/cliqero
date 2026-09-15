/**
 * Database-neutral query result and execution contracts.
 *
 * Infrastructure adapters translate their native database results into this
 * small shape. Inner layers depend on the contract, never on a driver type.
 */
export interface QueryResult<TRow = Record<string, unknown>> {
  readonly rows: TRow[];
  readonly rowCount: number | null;
}

export interface QueryExecutor {
  query<TRow extends object = Record<string, unknown>>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
}
