import type { OutboxEventHandler } from "./dispatcher";
import type { ClaimedOutboxEvent } from "@/infrastructure/postgres/outbox";

export class AuditedFactHandler implements OutboxEventHandler {
  readonly eventNames=["entitlement.created","purchase.distribution.completed","withdrawal.requested","withdrawal.approved","withdrawal.rejected","withdrawal.cancelled","withdrawal.completed","payout.attempt.created","payout.submitted","payout.failed","payout.succeeded","payout.reconciliation.required"];
  async handle(_:ClaimedOutboxEvent):Promise<void> {
    // These durable facts currently have no additional asynchronous consequence.
    // Explicit acknowledgement keeps the dispatcher contract visible until a real consumer exists.
  }
}

import type {PurchaseDistributionProcessor} from "@/processors/purchase-distribution";
export class PurchaseCompletedDistributionHandler implements OutboxEventHandler {
  readonly eventNames=["purchase.completed"];
  constructor(private readonly processor:PurchaseDistributionProcessor){}
  async handle(event:ClaimedOutboxEvent):Promise<void>{await this.processor.process({purchaseId:event.aggregateId,correlationId:event.correlationId});}
}

import type {EntitlementRepository} from "@/modules/entitlement/entitlement";
export class PurchaseReversalEntitlementHandler implements OutboxEventHandler {
  readonly eventNames=["purchase.reversal.completed"];
  constructor(private readonly entitlements:EntitlementRepository){}
  async handle(event:ClaimedOutboxEvent):Promise<void>{
    const purchaseId=isObject(event.payload)&&typeof event.payload.purchaseId==="string"?event.payload.purchaseId:null;if(!purchaseId)throw new Error("Reversal payload is invalid");
    const entitlement=await this.entitlements.findByPurchaseId(purchaseId);if(!entitlement)return;entitlement.revoke();await this.entitlements.save(entitlement);
  }
}
function isObject(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null;}
