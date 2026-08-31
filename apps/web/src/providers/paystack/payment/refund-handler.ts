import { Money } from "@/modules/money/money";
import type { PostgresProviderEventRepository } from "@/infrastructure/postgres/provider-events";
import type { PaymentRepository } from "@/modules/payment/payment";
import type { PurchaseRepository } from "@/modules/purchase/purchase";
import type { PurchaseReversalProcessor } from "@/processors/purchase-reversal";
import type { OutboxEventHandler } from "@/workers/outbox/dispatcher";
import type { ClaimedOutboxEvent } from "@/infrastructure/postgres/outbox";
export class PaystackRefundProcessedHandler implements OutboxEventHandler {
  readonly eventNames = ["payment.paystack.refund-processed"];
  constructor(
    private readonly events: PostgresProviderEventRepository,
    private readonly payments: PaymentRepository,
    private readonly purchases: PurchaseRepository,
    private readonly reversals: PurchaseReversalProcessor,
  ) {}
  async handle(event: ClaimedOutboxEvent) {
    const id = isPayload(event.payload) ? event.payload.providerEventId : null;
    if (!id) throw new Error("Refund event payload is invalid");
    const providerEvent = await this.events.findById(id);
    if (!providerEvent) throw new Error("Paystack refund provider event not found");
    if (providerEvent.state !== "received") return;
    if (
      !providerEvent.providerReference ||
      providerEvent.amountMinor === null ||
      !providerEvent.currency
    ) {
      await this.events.markRejected(id, "Refund event is missing transaction facts");
      return;
    }
    const payment = await this.payments.findByProviderReference(
      "paystack",
      providerEvent.providerReference,
    );
    if (!payment) {
      await this.events.markRejected(id, "Unknown Paystack refund transaction reference");
      return;
    }
    if (
      !Money.of(BigInt(providerEvent.amountMinor), providerEvent.currency).equals(
        payment.collectionAmount ?? payment.amount,
      )
    ) {
      await this.events.markRejected(
        id,
        "Only full Paystack refunds are supported and amount/currency must match",
      );
      return;
    }
    const purchase = await this.purchases.findByIdempotencyKey(payment.idempotencyKey);
    if (!purchase) throw new Error("Refund purchase not found");
    await this.reversals.process({
      purchaseId: purchase.id,
      reason: "Paystack refund processed",
      source: `paystack:${providerEvent.eventKey}`,
      idempotencyKey: `paystack-refund:${providerEvent.eventKey}`,
      correlationId: event.correlationId,
    });
    await this.events.markProcessed(id);
  }
}
function isPayload(payload: object): payload is { providerEventId: string } {
  return "providerEventId" in payload && typeof payload.providerEventId === "string";
}
