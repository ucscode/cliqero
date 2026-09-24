import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { AccountProjectionService } from "@/infrastructure/postgres/account/projections";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("account projection pagination", () => {
  it("preserves raw ledger available balances without reservation semantics", async () => {
    const service = new AccountProjectionService({
      query: async <T extends object>() =>
        result([
          { currency: "USD", balance_state: "available", amount_minor: "340" },
          { currency: "USD", balance_state: "pending", amount_minor: "50" },
        ] as T[]),
    });

    await expect(service.earnings("account")).resolves.toEqual({
      balances: [
        { currency: "USD", state: "available", amount_minor: "340" },
        { currency: "USD", state: "pending", amount_minor: "50" },
      ],
    });
  });

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
            listing_short_description_snapshot: "First summary",
            listing_long_description_snapshot: "First details",
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
            listing_short_description_snapshot: "Second summary",
            listing_long_description_snapshot: "Second details",
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
    expect(first.items[0]).toMatchObject({
      short_description: "First summary",
      long_description: "First details",
    });
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

  it("paginates earnings with the created_at/id keyset", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const sql = {
      query: async <T extends object>(query: string, values: readonly unknown[] = []) => {
        calls.push({ sql: query, values });
        return result<T>(
          (calls.length === 1
            ? [
                {
                  id: "entry-1",
                  purchase_id: "purchase-1",
                  entry_type: "purchase-earnings",
                  direction: "credit",
                  amount_minor: "310",
                  currency: "USD",
                  recipient_role: "referral",
                  balance_state: "available",
                  created_at: "2026-01-02T00:00:00.000Z",
                },
                {
                  id: "entry-2",
                  purchase_id: "purchase-2",
                  entry_type: "purchase-earnings",
                  direction: "credit",
                  amount_minor: "620",
                  currency: "USD",
                  recipient_role: "seller",
                  balance_state: "available",
                  created_at: "2026-01-01T00:00:00.000Z",
                },
              ]
            : [
                {
                  id: "entry-2",
                  purchase_id: "purchase-2",
                  entry_type: "purchase-earnings",
                  direction: "credit",
                  amount_minor: "620",
                  currency: "USD",
                  recipient_role: "seller",
                  balance_state: "available",
                  created_at: "2026-01-01T00:00:00.000Z",
                },
              ]) as T[],
        );
      },
    };
    const service = new AccountProjectionService(sql);

    const first = await service.earningEntries("account", { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ id: "entry-1", amount_minor: "310" });
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    const second = await service.earningEntries("account", { limit: 1, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({ id: "entry-2", amount_minor: "620" });
    expect(second.nextCursor).toBeNull();
    expect(calls[1].values[1]).toBe("2026-01-02T00:00:00.000Z");
    expect(calls[1].values[2]).toBe("entry-1");
  });

  it("keeps referral level and commercial detail out of the customer earnings projection", async () => {
    let query = "";
    const service = new AccountProjectionService({
      query: async <T extends object>(sql: string) => {
        query = sql;
        return result<T>([
          {
            id: "entry-privacy",
            purchase_id: "purchase-compatibility-id",
            entry_type: "purchase-earnings",
            direction: "credit",
            amount_minor: "120",
            currency: "USD",
            recipient_role: "referral",
            balance_state: "available",
            created_at: "2026-01-02T00:00:00.000Z",
            referral_level: 3,
            listing_title_snapshot: "Private listing title",
          },
        ] as T[]);
      },
    });

    const projection = await service.earningEntries("account", { limit: 10 });

    expect(query).not.toContain("referral_level");
    expect(projection.items[0]).toEqual({
      id: "entry-privacy",
      purchase_id: "purchase-compatibility-id",
      entry_type: "purchase-earnings",
      direction: "credit",
      amount_minor: "120",
      currency: "USD",
      recipient_role: "referral",
      balance_state: "available",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    expect(projection.items[0]).not.toHaveProperty("referral_level");
    expect(projection.items[0]).not.toHaveProperty("listing_title_snapshot");
  });
});
