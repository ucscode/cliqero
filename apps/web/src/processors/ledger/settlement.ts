import type { SettlementResult } from "@/modules/ledger/settlement";
import type { SettlementStore } from "@/processors/ledger/contracts";
import type { AccountDebtService } from "@/application/finance/account-debt";
import type { UnitOfWork } from "@/kernel/unit-of-work";

export class SettlementProcessor {
  constructor(
    private readonly store: SettlementStore,
    private readonly uow: UnitOfWork,
    private readonly debt: AccountDebtService,
  ) {}

  async settle(input: { now?: Date; batchSize?: number } = {}): Promise<SettlementResult> {
    const batchSize = input.batchSize ?? 100;
    if (batchSize < 1 || batchSize > 1000) throw new Error("Invalid settlement batch size");
    const now = input.now ?? new Date();
    return this.uow.transaction(async () => {
      const entries = await this.store.claimMatured({ now, batchSize });
      for (const entry of entries) {
        if (
          entry.accountId &&
          entry.entryType === "purchase-earnings" &&
          (entry.recipientRole === "seller" || entry.recipientRole === "referral")
        ) {
          await this.debt.settleInflow({
            accountId: entry.accountId,
            incomingMinor: BigInt(entry.amountMinor),
            wallet: "earnings",
            sourceKind: "purchase_earning",
            sourceId: entry.id,
            reason: "Purchase earnings settled outstanding account debt before spendability",
            actor: { kind: "system", id: "purchase-distribution-processor" },
            correlationId: entry.correlationId,
            idempotencyKey: `debt-settlement:purchase-earning:${entry.id}`,
          });
        }
      }
      return { claimed: entries.length, settled: await this.store.recordSettlements(entries, now) };
    });
  }
}
