import { Money } from "@/modules/money/money";
import type { PaymentRepository } from "@/modules/payment";
import type { PostgresProviderEventRepository } from "@/infrastructure/postgres/payment/provider-events";
import type { ClaimedOutboxEvent } from "@/infrastructure/postgres/shared/outbox";
import type { OutboxEventHandler } from "@/workers/outbox/dispatcher";
import type { FundingRepository } from "@/modules/funding/funding";

export class PaystackChargeSucceededHandler implements OutboxEventHandler {
  readonly eventNames = ["payment.paystack.charge-succeeded"];
  constructor(
    private readonly providerEvents: PostgresProviderEventRepository,
    private readonly payments: PaymentRepository,
    private readonly funding?: FundingRepository,
  ) {}
  async handle(event: ClaimedOutboxEvent): Promise<void> {
    const providerEventId = isPayload(event.payload) ? event.payload.providerEventId : null;
    if (!providerEventId) throw new Error("Paystack outbox event payload is invalid");
    const providerEvent = await this.providerEvents.findById(providerEventId);
    if (!providerEvent) throw new Error("Paystack provider event not found");
    if (
      providerEvent.state === "processed" ||
      providerEvent.state === "rejected" ||
      providerEvent.state === "ignored"
    )
      return;
    if (
      !providerEvent.providerReference ||
      providerEvent.amountMinor === null ||
      !providerEvent.currency
    ) {
      await this.providerEvents.markRejected(
        providerEvent.id,
        "Paystack charge event is missing required transaction facts",
      );
      return;
    }
    const providerTransactionId = providerEventTransactionId(providerEvent.payload);
    const funding =
      (providerTransactionId
        ? await this.funding?.findByProviderTransactionId("paystack", providerTransactionId)
        : null) ??
      (await this.funding?.findByProviderReference("paystack", providerEvent.providerReference));
    if (funding) {
      if (funding.providerReference !== providerEvent.providerReference) {
        await this.providerEvents.markRejected(
          providerEvent.id,
          "Paystack webhook reference and transaction identity mismatch",
        );
        return;
      }
      const webhookAmount = Money.of(BigInt(providerEvent.amountMinor), providerEvent.currency);
      if (!webhookAmount.equals(funding.collectionAmount)) {
        await this.providerEvents.markRejected(
          providerEvent.id,
          "Paystack webhook amount or currency mismatch",
        );
        return;
      }
      if (
        funding.providerTransactionId &&
        providerTransactionId &&
        funding.providerTransactionId !== providerTransactionId
      ) {
        await this.providerEvents.markRejected(
          providerEvent.id,
          "Paystack webhook transaction identity mismatch",
        );
        return;
      }
      if (providerTransactionId) funding.providerTransactionId = providerTransactionId;
      if (funding.state === "awaiting_payment") funding.state = "verification_pending";
      await this.funding!.save(funding);
      await this.providerEvents.markProcessed(providerEvent.id);
      return;
    }
    const payment = await this.payments.findByProviderReference(
      "paystack",
      providerEvent.providerReference,
    );
    if (!payment) {
      await this.providerEvents.markRejected(
        providerEvent.id,
        "Unknown Paystack payment reference",
      );
      return;
    }
    const webhookAmount = Money.of(BigInt(providerEvent.amountMinor), providerEvent.currency);
    if (!webhookAmount.equals(payment.collectionAmount ?? payment.amount)) {
      await this.providerEvents.markRejected(
        providerEvent.id,
        "Paystack webhook amount or currency mismatch",
      );
      return;
    }
    payment.state = "verification_pending";
    await this.payments.save(payment);
    await this.providerEvents.markProcessed(providerEvent.id);
  }
}
function isPayload(payload: object): payload is { providerEventId: string } {
  return "providerEventId" in payload && typeof payload.providerEventId === "string";
}

function providerEventTransactionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === "number" && Number.isSafeInteger(id) ? String(id) : null;
}
