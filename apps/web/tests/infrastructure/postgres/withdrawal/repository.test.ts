import { describe, expect, it } from "vitest";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { PostgresWithdrawalRepository } from "@/infrastructure/postgres/withdrawal/withdrawals";

function row(id: string, cursor_id: string) {
  return {
    id,
    cursor_id,
    cursor_created_at: "2026-03-01 12:00:00.123456+00",
    account_id: "account-1",
    amount_minor: "1200",
    currency: "USD",
    saved_destination_id: "destination-1",
    destination_method: "bank_ng",
    destination_method_name: "Bank account",
    destination_name: "Main",
    destination_details: [],
    state: "requested" as const,
    idempotency_key: `key-${id}`,
    correlation_id: `correlation-${id}`,
    reason: null,
    external_reference: null,
    completion_note: null,
    completed_by: null,
    completed_at: null,
    created_at: new Date("2026-03-01T12:00:00Z"),
    updated_at: new Date("2026-03-01T12:00:00Z"),
  };
}

describe("PostgresWithdrawalRepository account history pagination", () => {
  it("uses account-scoped keyset pages and advances from the last returned row", async () => {
    const calls: { statement: string; values: readonly unknown[] }[] = [];
    const sql: QueryExecutor = {
      query: async (statement, values = []) => {
        calls.push({ statement, values });
        return { rows: [row("w1", "31"), row("w2", "30"), row("w3", "29")] as any, rowCount: 3 };
      },
    };
    const repository = new PostgresWithdrawalRepository(sql);
    const first = await repository.listForAccount("account-1", { limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(["w1", "w2"]);
    expect(first.nextCursor).toBeTruthy();
    expect(calls[0].statement).toContain(
      "w.account_id=(select id from identity_capability.accounts where uuid=$1)",
    );
    expect(calls[0].statement).toContain("(w.created_at,w.id)<($2::timestamptz,$3::bigint)");
    expect(calls[0].values).toEqual(["account-1", null, null, 3]);

    const decoded = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"));
    expect(decoded).toEqual({ created_at: "2026-03-01 12:00:00.123456+00", id: "30" });
  });

  it("rejects malformed cursors rather than silently restarting the account history", async () => {
    const sql: QueryExecutor = { query: async () => ({ rows: [], rowCount: 0 }) };
    await expect(
      new PostgresWithdrawalRepository(sql).listForAccount("account-1", {
        cursor: "not-a-cursor",
        limit: 25,
      }),
    ).rejects.toThrow("Invalid withdrawal history cursor");
  });

  it("preserves database timestamp precision when requesting the next page", async () => {
    const calls: { values: readonly unknown[] }[] = [];
    const sql: QueryExecutor = {
      query: async (_statement, values = []) => {
        calls.push({ values });
        return { rows: [row("w1", "31"), row("w2", "30"), row("w3", "29")] as any, rowCount: 3 };
      },
    };
    const repository = new PostgresWithdrawalRepository(sql);
    const first = await repository.listForAccount("account-1", { limit: 2 });
    await repository.listForAccount("account-1", { cursor: first.nextCursor!, limit: 2 });
    expect(calls[1].values).toEqual(["account-1", "2026-03-01 12:00:00.123456+00", "30", 3]);
  });
});
