import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { EventOutbox } from "@/kernel/events";
import type { LedgerRepository, LedgerEntryDraft } from "@/modules/ledger/ledger";
import type { PurchaseRepository } from "@/modules/purchase/purchase";
import { Money } from "@/modules/money/money";

export interface ReversalRecord {
  id: string;
  purchaseId: string;
  distributionId: string;
  state: "processed";
  reason: string;
  source: string;
  idempotencyKey: string;
  correlationId: string;
  processedAt: Date;
}
export interface ReversalRepository {
  findByPurchaseId(purchaseId: string): Promise<ReversalRecord | null>;
  create(reversal: Omit<ReversalRecord, "processedAt">): Promise<void>;
}
export class PurchaseReversalProcessor {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly ledger: LedgerRepository,
    private readonly reversals: ReversalRepository,
    private readonly outbox: EventOutbox,
    private readonly uow: UnitOfWork,
  ) {}
  async process(input: {
    purchaseId: string;
    reason: string;
    source: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<ReversalRecord> {
    return this.uow.transaction(async () => {
      const purchase = await this.purchases.findById(input.purchaseId, { forUpdate: true });
      if (!purchase) throw new Error("Purchase not found");
      if (purchase.state !== "completed")
        throw new Error("Only completed purchases can be reversed");
      const existing = await this.reversals.findByPurchaseId(purchase.id);
      if (existing) return existing;
      const distribution = await this.ledger.findDistributionByPurchaseId(purchase.id);
      if (!distribution) throw new Error("Purchase distribution not found");
      const originals = (await this.ledger.findEntriesByPurchaseId(purchase.id)).filter(
        (entry) =>
          entry.entryType === "purchase-earnings" &&
          entry.direction === "credit" &&
          entry.originalEntryId === undefined &&
          entry.reversalId === undefined,
      );
      const accountIds = [
        ...new Set(originals.flatMap((entry) => (entry.accountId ? [entry.accountId] : []))),
      ].sort();
      for (const accountId of accountIds) await this.ledger.lockAccountForMutation(accountId);
      const reversal = {
        id: newId(),
        purchaseId: purchase.id,
        distributionId: distribution.id,
        state: "processed" as const,
        reason: input.reason.trim(),
        source: input.source,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
      };
      if (!reversal.reason) throw new Error("Reversal reason is required");
      await this.reversals.create(reversal);
      const compensations: LedgerEntryDraft[] = originals.flatMap((original) => {
        const remainingMinor = original.amount.minorAmount - (original.correctedMinor ?? 0n);
        if (remainingMinor <= 0n) return [];
        return [
          {
            id: newId(),
            distributionId: distribution.id,
            accountId: original.accountId,
            purchaseId: purchase.id,
            entryType: "purchase-reversal",
            direction: "debit",
            amount: Money.of(remainingMinor, original.amount.currency),
            idempotencyKey: `purchase-reversal:${reversal.id}:${original.id}`,
            correlationId: input.correlationId,
            recipientRole: original.recipientRole,
            basis: "purchase-reversal",
            referralLevel: original.referralLevel,
            balanceState: original.balanceState,
            originalEntryId: original.id,
            reversalId: reversal.id,
          },
        ];
      });
      await this.ledger.append(compensations);
      await this.outbox.append([
        {
          id: newId(),
          name: "purchase.reversal.completed",
          aggregateId: reversal.id,
          correlationId: input.correlationId,
          occurredAt: new Date(),
          payload: { purchaseId: purchase.id, reversalId: reversal.id },
        },
      ]);
      const result = await this.reversals.findByPurchaseId(purchase.id);
      if (!result) throw new Error("Reversal persistence failed");
      return result;
    });
  }
}
