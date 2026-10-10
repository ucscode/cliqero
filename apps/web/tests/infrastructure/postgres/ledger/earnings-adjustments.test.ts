import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { PostgresEarningsAdjustmentRepository } from "@/infrastructure/postgres/ledger/earnings-adjustments";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("PostgresEarningsAdjustmentRepository summaries", () => {
  it("aggregates credits, debits and net across the filtered dataset independently of the page", async () => {
    const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
    const repository = new PostgresEarningsAdjustmentRepository({
      query: async <T extends object>(sql: string, values: readonly unknown[] = []) => {
        queries.push({ sql, values });
        if (sql.includes("sum(amount_minor)"))
          return result([{ credit_minor: "2500", debit_minor: "500", net_minor: "2000" } as T]);
        return result([
          {
            id: "00000000-0000-4000-8000-000000000010",
            cursor_id: "1",
            account_id: "00000000-0000-4000-8000-000000000001",
            username: "member",
            amount_minor: "2500",
            reason: "Credit",
            reference: null,
            created_by: "00000000-0000-4000-8000-000000000002",
            created_at: "2026-10-01T00:00:00.000Z",
            current_balance_minor: "2000",
          } as T,
        ]);
      },
    });

    const page = await repository.list({ search: "member", limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.summary).toEqual({ creditMinor: "2500", debitMinor: "500", netMinor: "2000" });
    expect(queries).toHaveLength(2);
    expect(queries[1].sql).toContain("sum(amount_minor) filter (where amount_minor > 0)");
    expect(queries[1].sql).toContain("sum(amount_minor) filter (where amount_minor < 0)");
    expect(queries[1].sql).toContain("a.username ilike");
    expect(queries[1].sql).not.toContain("cursor");
  });
});
