import type { EventOutbox } from "@/kernel/events";
import { newId, type Id } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { PurchaseRepository } from "@/modules/purchase/purchase";
import type { PaymentRepository, PaymentProviderRegistry } from "@/modules/payment";
import { Entitlement, type EntitlementRepository } from "@/modules/entitlement/entitlement";
import type { IdempotencyStore } from "./contracts";

export class PaymentCompletionService {
  constructor(
    private payments: PaymentRepository,
    private purchases: PurchaseRepository,
    private entitlements: EntitlementRepository,
    private providers: PaymentProviderRegistry,
    private idempotency: IdempotencyStore,
    private outbox: EventOutbox,
    private uow: UnitOfWork,
  ) {}
  async complete(input: { paymentId: Id; correlationId: Id }): Promise<Entitlement> {
    const payment = await this.payments.findById(input.paymentId);
    if (!payment) throw new Error("Payment not found");
    const collectionAmount = payment.collectionAmount ?? payment.amount;
    const verified = await this.providers.get(payment.providerName).verify({
      reference: payment.providerReference,
      expectedAmount: collectionAmount,
      providerTransactionId: payment.providerTransactionId,
    });
    if (verified.state !== "confirmed") throw new Error("Payment verification failed");
    if (verified.reference !== payment.providerReference)
      throw new Error("Payment reference mismatch");
    if (!verified.amount || !verified.amount.equals(collectionAmount))
      throw new Error("Payment amount or currency mismatch");
    if (
      payment.providerTransactionId &&
      verified.providerTransactionId &&
      payment.providerTransactionId !== verified.providerTransactionId
    )
      throw new Error("Payment provider transaction mismatch");
    return this.uow.transaction(async () => {
      const lockedPayment = await this.payments.findById(payment.id, { forUpdate: true });
      if (!lockedPayment) throw new Error("Payment not found");
      const purchase = await this.purchases.findByIdempotencyKey(lockedPayment.idempotencyKey);
      if (!purchase) throw new Error("Purchase not found");
      const lockedPurchase = await this.purchases.findById(purchase.id, { forUpdate: true });
      if (!lockedPurchase) throw new Error("Purchase not found");
      const existing = await this.entitlements.findByPurchaseId(lockedPurchase.id);
      if (existing) return existing;
      const key = `${lockedPayment.providerName}:${lockedPayment.providerReference}`;
      const claimed = await this.idempotency.begin("payment-completion", key);
      if (!claimed) {
        const completed = await this.entitlements.findByPurchaseId(lockedPurchase.id);
        if (completed) return completed;
        throw new Error("Payment completion is already processing");
      }
      lockedPayment.state = "verified";
      lockedPayment.providerTransactionId =
        verified.providerTransactionId ?? lockedPayment.providerTransactionId;
      lockedPayment.providerFee = verified.providerFee;
      lockedPayment.providerVerifiedPayload = {
        state: verified.state,
        reference: verified.reference,
        amountMinor: verified.amount?.minorAmount.toString(),
        currency: verified.amount?.currency,
        providerFeeMinor: verified.providerFee?.minorAmount.toString(),
        providerFeeCurrency: verified.providerFee?.currency,
      };
      await this.payments.save(lockedPayment);
      lockedPurchase.markPaid();
      lockedPurchase.complete();
      await this.purchases.save(lockedPurchase);
      const entitlement = new Entitlement(
        newId(),
        lockedPurchase.buyerId,
        lockedPurchase.terms.listingId,
        lockedPurchase.id,
      );
      await this.entitlements.save(entitlement);
      const occurredAt = new Date();
      await this.outbox.append([
        {
          id: newId(),
          name: "purchase.completed",
          aggregateId: lockedPurchase.id,
          correlationId: input.correlationId,
          occurredAt,
          payload: { entitlementId: entitlement.id },
        },
        {
          id: newId(),
          name: "entitlement.created",
          aggregateId: entitlement.id,
          correlationId: input.correlationId,
          occurredAt,
          payload: { purchaseId: lockedPurchase.id },
        },
      ]);
      await this.idempotency.complete("payment-completion", key, entitlement.id, {
        entitlementId: entitlement.id,
      });
      return entitlement;
    });
  }
}
