import type { OutboxEventHandler } from "./dispatcher";
import type { ClaimedOutboxEvent } from "@/infrastructure/postgres/shared/outbox";
import { FUNDING_PROOF_CLEANUP_EVENT, type FundingProofCleanupPayload } from "@/kernel/events";
import type { ObjectStorageRegistry } from "@/modules/storage/object-storage";

export class AuditedFactHandler implements OutboxEventHandler {
  readonly eventNames = [
    "entitlement.created",
    "purchase.distribution.completed",
    "withdrawal.requested",
    "withdrawal.approved",
    "withdrawal.rejected",
    "withdrawal.cancelled",
    "withdrawal.completed",
  ];
  async handle(): Promise<void> {
    // These durable facts currently have no additional asynchronous consequence.
    // Explicit acknowledgement keeps the dispatcher contract visible until a real consumer exists.
  }
}

import type { PurchaseDistributionProcessor } from "@/processors/purchase/distribution";
export class PurchaseCompletedDistributionHandler implements OutboxEventHandler {
  readonly eventNames = ["purchase.completed"];
  constructor(private readonly processor: PurchaseDistributionProcessor) {}
  async handle(event: ClaimedOutboxEvent): Promise<void> {
    await this.processor.process({
      purchaseId: event.aggregateId,
      correlationId: event.correlationId,
    });
  }
}

import type { EntitlementRepository } from "@/modules/entitlement/entitlement";
export class PurchaseReversalEntitlementHandler implements OutboxEventHandler {
  readonly eventNames = ["purchase.reversal.completed"];
  constructor(private readonly entitlements: EntitlementRepository) {}
  async handle(event: ClaimedOutboxEvent): Promise<void> {
    const purchaseId =
      isObject(event.payload) && typeof event.payload.purchaseId === "string"
        ? event.payload.purchaseId
        : null;
    if (!purchaseId) throw new Error("Reversal payload is invalid");
    const entitlement = await this.entitlements.findByPurchaseId(purchaseId);
    // A reversal revokes a still-active entitlement. Already-terminal history
    // (including a consumed one-time entitlement) remains unchanged.
    if (!entitlement || entitlement.state !== "active") return;
    entitlement.revoke();
    await this.entitlements.save(entitlement);
  }
}

export class FundingProofCleanupHandler implements OutboxEventHandler {
  readonly eventNames = [FUNDING_PROOF_CLEANUP_EVENT];
  constructor(private readonly storage: Pick<ObjectStorageRegistry, "get">) {}

  async handle(event: ClaimedOutboxEvent): Promise<void> {
    const payload = parseFundingProofCleanupPayload(event.payload);
    await this.storage.get(payload.storageProvider).delete({
      provider: payload.storageProvider,
      container: payload.container,
      key: payload.key,
    });
  }
}

function parseFundingProofCleanupPayload(value: object): FundingProofCleanupPayload {
  if (
    !isObject(value) ||
    typeof value.fundingId !== "string" ||
    typeof value.storageProvider !== "string" ||
    typeof value.container !== "string" ||
    typeof value.key !== "string" ||
    !value.fundingId ||
    !value.storageProvider ||
    !value.container ||
    !value.key
  )
    throw new Error("Funding proof cleanup payload is invalid");
  return value as FundingProofCleanupPayload;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
