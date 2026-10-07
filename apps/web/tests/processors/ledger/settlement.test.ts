import { describe, expect, it, vi } from "vitest";
import type { AccountDebtService } from "@/application/finance/account-debt";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { MaturedLedgerEntry, SettlementStore } from "@/processors/ledger/contracts";
import { SettlementProcessor } from "@/processors/ledger/settlement";

const entry: MaturedLedgerEntry = {
  id: "00000000-0000-4000-8000-000000000001",
  relationalId: "1",
  accountId: "00000000-0000-4000-8000-000000000002",
  amountMinor: "1000",
  entryType: "purchase-earnings",
  recipientRole: "seller",
  correlationId: "00000000-0000-4000-8000-000000000003",
};

describe("SettlementProcessor", () => {
  it("processes persisted matured entries without consulting the current distribution policy", async () => {
    const store: SettlementStore = {
      claimMatured: vi.fn(async () => [entry]),
      recordSettlements: vi.fn(async () => 1),
    };
    const debt = { settleInflow: vi.fn(async () => undefined) } as unknown as AccountDebtService;
    const processor = new SettlementProcessor(
      store,
      { transaction: async (operation) => operation() },
      debt,
    );

    await expect(processor.settle({ now: new Date("2026-10-07T00:00:00Z") })).resolves.toEqual({
      claimed: 1,
      settled: 1,
    });
    expect(store.claimMatured).toHaveBeenCalledOnce();
    expect(debt.settleInflow).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: "purchase_earning",
        sourceId: entry.id,
        idempotencyKey: `debt-settlement:purchase-earning:${entry.id}`,
      }),
    );
    expect(store.recordSettlements).toHaveBeenCalledOnce();
  });

  it("keeps debt settlement and availability recording in one rollback-capable transaction", async () => {
    const events: string[] = [];
    const store: SettlementStore = {
      claimMatured: vi.fn(async () => {
        events.push("claim");
        return [entry];
      }),
      recordSettlements: vi.fn(async () => {
        events.push("record");
        return 1;
      }),
    };
    const debt = {
      settleInflow: vi.fn(async () => {
        events.push("debt");
        throw new Error("debt persistence failed");
      }),
    } as unknown as AccountDebtService;
    const processor = new SettlementProcessor(
      store,
      {
        transaction: async (operation) => {
          events.push("begin");
          try {
            const result = await operation();
            events.push("commit");
            return result;
          } catch (error) {
            events.push("rollback");
            throw error;
          }
        },
      },
      debt,
    );

    await expect(processor.settle()).rejects.toThrow("debt persistence failed");
    expect(events).toEqual(["begin", "claim", "debt", "rollback"]);
    expect(store.recordSettlements).not.toHaveBeenCalled();
  });

  it("retains batch-size validation", async () => {
    const transaction = vi.fn(async <T>(operation: () => Promise<T>): Promise<T> => operation());
    const processor = new SettlementProcessor(
      { claimMatured: vi.fn(), recordSettlements: vi.fn() } as unknown as SettlementStore,
      { transaction: transaction as unknown as UnitOfWork["transaction"] },
      { settleInflow: vi.fn() } as unknown as AccountDebtService,
    );
    await expect(processor.settle({ batchSize: 0 })).rejects.toThrow(
      "Invalid settlement batch size",
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
