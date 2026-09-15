import type { ClaimedOutboxEvent } from "@/kernel/events";

export interface PurchaseReversalUseCase {
  process(input: {
    purchaseId: string;
    reason: string;
    source: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<unknown>;
}

export type { ClaimedOutboxEvent };
