import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { AccountProjectionService } from "@/infrastructure/postgres/account/projections";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("account projection pagination", () => {
  it("preserves raw ledger available balances without reservation semantics", async () => {
    const service = new AccountProjectionService({
      query: async <T extends object>(sql: string) =>
        result(
          (sql.includes("available_earnings_minor")
            ? [
                {
                  available_minor: "340",
                  purchase_earnings_minor: "500",
                  purchase_reversals_minor: "-60",
                  earnings_corrections_minor: "-20",
                  manual_adjustments_minor: "-80",
                  balance_transfers_minor: "0",
                  funding_reversals_minor: "0",
                  transfer_compensations_minor: "0",
                  debt_settlements_minor: "0",
                  withdrawal_reserved_minor: "0",
                  completed_withdrawals_minor: "0",
                  settled_purchase_earnings_minor: "0",
                },
              ]
            : [
                { currency: "USD", balance_state: "available", amount_minor: "340" },
                { currency: "USD", balance_state: "pending", amount_minor: "50" },
              ]) as T[],
        ),
    });

    await expect(service.earnings("account")).resolves.toEqual({
      balances: [
        { currency: "USD", state: "available", amount_minor: "340" },
        { currency: "USD", state: "pending", amount_minor: "50" },
      ],
      reconciliation: {
        available_minor: "340",
        purchase_earnings_minor: "500",
        purchase_reversals_minor: "-60",
        earnings_corrections_minor: "-20",
        manual_adjustments_minor: "-80",
        balance_transfers_minor: "0",
        funding_reversals_minor: "0",
        transfer_compensations_minor: "0",
        debt_settlements_minor: "0",
        withdrawal_reserved_minor: "0",
        completed_withdrawals_minor: "0",
        settled_purchase_earnings_minor: "0",
      },
    });
  });

  it("uses the ledger's authoritative available balance and exposes source movements without deriving a second total", async () => {
    const statements: string[] = [];
    const service = new AccountProjectionService({
      query: async <T extends object>(sql: string) => {
        statements.push(sql);
        if (sql.includes("available_earnings_minor"))
          return result([
            {
              available_minor: "1250",
              purchase_earnings_minor: "2000",
              purchase_reversals_minor: "-250",
              earnings_corrections_minor: "-100",
              manual_adjustments_minor: "200",
              balance_transfers_minor: "-100",
              funding_reversals_minor: "-100",
              transfer_compensations_minor: "0",
              debt_settlements_minor: "-100",
              withdrawal_reserved_minor: "-200",
              completed_withdrawals_minor: "-100",
              settled_purchase_earnings_minor: "1500",
            } as T,
          ]);
        return result<T>([]);
      },
    });

    const projection = await service.earnings("account");
    expect(projection.reconciliation).toMatchObject({
      available_minor: "1250",
      purchase_earnings_minor: "2000",
      purchase_reversals_minor: "-250",
      earnings_corrections_minor: "-100",
      manual_adjustments_minor: "200",
      balance_transfers_minor: "-100",
      funding_reversals_minor: "-100",
      debt_settlements_minor: "-100",
      withdrawal_reserved_minor: "-200",
      completed_withdrawals_minor: "-100",
      settled_purchase_earnings_minor: "1500",
    });
    expect(statements[1]).toContain("ledger_capability.available_earnings_minor");
    expect(statements[1]).not.toContain("greatest(0");
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
                  history_id: "generated:entry-1",
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
                  history_id: "generated:entry-2",
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
                  history_id: "generated:entry-2",
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
    expect(calls[1].values[2]).toBe("generated:entry-1");
    expect(calls[0].sql).toContain("earnings_adjustments");
    expect(calls[0].sql).toContain("history_id");
  });

  it("keeps referral level and commercial detail out of the customer earnings projection", async () => {
    let query = "";
    const service = new AccountProjectionService({
      query: async <T extends object>(sql: string) => {
        query = sql;
        return result<T>([
          {
            history_id: "generated:entry-privacy",
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
      source: "generated",
      reason: null,
      reference: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    expect(projection.items[0]).not.toHaveProperty("referral_level");
    expect(projection.items[0]).not.toHaveProperty("listing_title_snapshot");
  });

  it("projects signed earning adjustments into the cursor-paginated customer stream", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const service = new AccountProjectionService({
      query: async <T extends object>(sql: string, values: readonly unknown[] = []) => {
        calls.push({ sql, values });
        return result<T>([
          {
            history_id: "adjustment:adj-1",
            id: "adj-1",
            purchase_id: null,
            entry_type: "earnings-adjustment",
            direction: "credit",
            amount_minor: "1000",
            currency: "USD",
            recipient_role: null,
            balance_state: "available",
            reason: "Gift cash",
            reference: "TICKET-123",
            created_at: "2026-01-03T00:00:00.000Z",
          },
        ] as T[]);
      },
    });
    const page = await service.earningEntries("account", { limit: 1 });
    expect(page.items[0]).toMatchObject({
      purchase_id: null,
      source: "adjustment",
      entry_type: "earnings-adjustment",
      reason: "Gift cash",
      reference: "TICKET-123",
      amount_minor: "1000",
    });
    expect(calls[0].sql).toContain("union all");
    expect(calls[0].sql).toContain("order by created_at desc,history_id desc");
  });
});
