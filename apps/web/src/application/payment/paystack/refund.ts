import { Money } from "@/modules/money/money";
import type { ProviderEventStore } from "./contracts";
import type { PaymentRepository } from "@/modules/payment";
import type { PurchaseRepository } from "@/modules/purchase/purchase";
import type { ClaimedOutboxEvent, OutboxEventHandler } from "@/kernel/events";
import type { PurchaseReversalUseCase } from "./refund-contracts";
import type { FundingRepository } from "@/modules/funding/funding";
import type { FundingReversalService } from "@/application/funding/reversals";
import { PublicApplicationError } from "@/kernel/errors";
export class PaystackRefundProcessedHandler implements OutboxEventHandler {
  readonly eventNames = ["payment.paystack.refund-processed"];
  constructor(
    private readonly events: ProviderEventStore,
    private readonly payments: PaymentRepository,
    private readonly purchases: PurchaseRepository,
    private readonly reversals: PurchaseReversalUseCase,
    private readonly funding?: FundingRepository,
    private readonly fundingReversals?: FundingReversalService,
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
    const funding = await this.funding?.findByProviderReference(
      "paystack",
      providerEvent.providerReference,
    );
    if (funding) {
      if (!this.fundingReversals) throw new Error("Funding reversal handler is unavailable");
      const full =
        providerEvent.currency === funding.collectionAmount.currency &&
        BigInt(providerEvent.amountMinor) === funding.collectionAmount.minorAmount;
      try {
        await this.fundingReversals.applyProviderEvent({
          eventId: providerEvent.id,
          providerName: providerEvent.providerName,
          providerReference: providerEvent.providerReference,
          amountMinor: providerEvent.amountMinor,
          currency: providerEvent.currency,
          providerReversalReference:
            paystackRefundReference(providerEvent.payload) ?? providerEvent.eventKey,
          reason: "Paystack refund processed",
          full,
        });
      } catch (error) {
        if (!(error instanceof PublicApplicationError)) throw error;
        await this.events.markRejected(id, error.message);
        return;
      }
      await this.events.markProcessed(id);
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

function paystackRefundReference(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("data" in payload)) return null;
  const data = payload.data;
  if (!data || typeof data !== "object" || !("refund_reference" in data)) return null;
  return typeof data.refund_reference === "string" && data.refund_reference.trim()
    ? data.refund_reference.trim()
    : null;
}
