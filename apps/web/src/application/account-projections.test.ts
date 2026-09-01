import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { AccountProjectionService } from "./account-projections";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("account projection pagination", () => {
  it("uses a created_at/id keyset cursor for purchases", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const sql = {
      query: async <T extends object>(query: string, values: readonly unknown[] = []) => {
        calls.push({ sql: query, values });
        return result<T>([
          {
            id: "00000000-0000-4000-8000-000000000001",
            checkout_id: null,
            listing_id: "listing",
            listing_title_snapshot: "First",
            canonical_minor_snapshot: "100",
            canonical_currency_snapshot: "USD",
            state: "paid",
            created_at: "2026-01-02T00:00:00.000Z",
            entitlement_state: null,
            entitlement_expires_at: null,
            access_available: false,
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            checkout_id: null,
            listing_id: "listing",
            listing_title_snapshot: "Second",
            canonical_minor_snapshot: "100",
            canonical_currency_snapshot: "USD",
            state: "paid",
            created_at: "2026-01-01T00:00:00.000Z",
            entitlement_state: null,
            entitlement_expires_at: null,
            access_available: false,
          },
        ] as T[]);
      },
    };
    const service = new AccountProjectionService(sql);
    const first = await service.purchases("account", { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(calls[0].sql).toContain("p.created_at,p.id");
    const second = await service.purchases("account", { limit: 1, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    expect(calls[1].values[1]).toBe("2026-01-02T00:00:00.000Z");
    expect(calls[1].values[2]).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("rejects malformed projection cursors instead of issuing an unsafe query", async () => {
    const service = new AccountProjectionService({ query: async () => result([]) });
    await expect(
      service.earningEntries("account", { limit: 10, cursor: "not-a-cursor" }),
    ).rejects.toThrow("Invalid pagination cursor");
  });
});
