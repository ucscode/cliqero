import type { DomainEvent, EventOutbox } from "@/kernel/events";
import { newId, type Id } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Entitlement, type EntitlementRepository } from "@/modules/entitlement/entitlement";
import type { Purchase, PurchaseRepository } from "@/modules/purchase/purchase";

export class PurchaseCompletionProcessor {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly entitlements: EntitlementRepository,
    private readonly outbox: EventOutbox,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async complete(purchase: Purchase, correlationId: Id): Promise<Entitlement> {
    return this.unitOfWork.transaction(async () => {
      const priorPurchase = await this.purchases.findByIdempotencyKey(purchase.idempotencyKey);
      if (priorPurchase) {
        const priorEntitlement = await this.entitlements.findByPurchaseId(priorPurchase.id);
        if (!priorEntitlement) throw new Error("Completed purchase is missing its entitlement");
        return priorEntitlement;
      }
      purchase.markPaid();
      purchase.complete();
      const entitlement = new Entitlement(newId(), purchase.buyerId, purchase.terms.listingId, purchase.id);
      await this.purchases.save(purchase);
      await this.entitlements.save(entitlement);
      const occurredAt = new Date();
      const events: DomainEvent[] = [
        { id: newId(), name: "purchase.completed", aggregateId: purchase.id, occurredAt, correlationId, payload: { entitlementId: entitlement.id } },
        { id: newId(), name: "entitlement.created", aggregateId: entitlement.id, occurredAt, correlationId, payload: { purchaseId: purchase.id } },
      ];
      await this.outbox.append(events);
      return entitlement;
    });
  }
}

