import { describe, expect, it } from "vitest";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { PostgresWithdrawalPersistence } from "@/infrastructure/postgres/withdrawal/transaction";

describe("PostgresWithdrawalPersistence", () => {
  it("keeps the idempotency operation inside the database transaction and lock", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    const sql: QueryExecutor = {
      query: async (statement, values = []) => {
        statements.push(statement);
        parameters.push([...values]);
        return { rows: [], rowCount: 0 };
      },
    };
    const persistence = new PostgresWithdrawalPersistence(
      { transaction: async (operation) => operation() },
      sql,
    );
    const order: string[] = [];
    const result = await persistence.withIdempotencyLock("account-1", "key-1", async () => {
      order.push("operation");
      return "created";
    });
    expect(result).toBe("created");
    expect(order).toEqual(["operation"]);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(parameters).toEqual([["withdrawal:idempotency:account-1:key-1"]]);
  });

  it("incorporates account identity into the lock key", async () => {
    const parameters: unknown[][] = [];
    const sql: QueryExecutor = {
      query: async (_statement, values = []) => {
        parameters.push([...values]);
        return { rows: [], rowCount: 0 };
      },
    };
    const persistence = new PostgresWithdrawalPersistence(
      { transaction: async (operation) => operation() },
      sql,
    );

    await persistence.withIdempotencyLock("account-a", "shared-key", async () => undefined);
    await persistence.withIdempotencyLock("account-b", "shared-key", async () => undefined);

    expect(parameters).toEqual([
      ["withdrawal:idempotency:account-a:shared-key"],
      ["withdrawal:idempotency:account-b:shared-key"],
    ]);
  });
});
