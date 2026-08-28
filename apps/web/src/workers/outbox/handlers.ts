import type { OutboxEventHandler } from "./dispatcher";
import type { ClaimedOutboxEvent } from "@/infrastructure/postgres/outbox";

export class AuditedFactHandler implements OutboxEventHandler {
  readonly eventNames=["entitlement.created","purchase.distribution.completed"];
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
