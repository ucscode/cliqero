import { describe, expect, it } from "vitest";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { PostgresWithdrawalPersistence } from "@/infrastructure/postgres/withdrawal/transaction";

describe("PostgresWithdrawalPersistence", () => {
  it("keeps the idempotency operation inside the database transaction and lock", async () => {
    const statements: string[] = [];
    const sql: QueryExecutor = {
      query: async (statement) => {
        statements.push(statement);
        return { rows: [], rowCount: 0 };
      },
    };
    const persistence = new PostgresWithdrawalPersistence(
      { transaction: async (operation) => operation() },
      sql,
    );
    const order: string[] = [];
    const result = await persistence.withIdempotencyLock("key-1", async () => {
      order.push("operation");
      return "created";
    });
    expect(result).toBe("created");
    expect(order).toEqual(["operation"]);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("pg_advisory_xact_lock");
  });
});
