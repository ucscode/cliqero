import { describe, expect, it, vi } from "vitest";
import { PaymentReconciliationService } from "@/application/payment/reconciliation";
import { Money } from "@/modules/money/money";
import type { PaymentRecord } from "@/modules/payment";

describe("PaymentReconciliationService", () => {
  it.each(["paystack", "flutterwave"])(
    "delegates %s payment verification through the injected generic verifier",
    async (providerName) => {
      const payment: PaymentRecord = {
        id: "payment-1",
        providerName,
        providerReference: `${providerName}-reference`,
        buyerId: "buyer-1",
        listingId: "listing-1",
        amount: Money.of(1000n, "USD"),
        canonicalAmount: Money.of(1000n, "USD"),
        state: "awaiting_payment",
        idempotencyKey: "payment-create-key",
      };
      const verification = {
        process: vi.fn(async () => {
          payment.state = "verified";
        }),
      };
      const operations = {
        begin: async (input: any) => ({
          created: true,
          attempt: {
            id: "attempt-1",
            paymentId: input.paymentId,
            idempotencyKey: input.idempotencyKey,
            state: "started" as const,
            result: null,
            lastError: null,
            actorId: input.actorId,
            correlationId: input.correlationId,
          },
        }),
        finish: vi.fn(async () => undefined),
      };
      const service = new PaymentReconciliationService(
        {
          findById: async () => payment,
          findByProviderReference: async () => payment,
          findByIdempotencyKey: async () => payment,
          save: async () => undefined,
          findPendingByProviderOlderThan: async () => [],
        },
        verification,
        operations,
        { requireCapability: async () => undefined } as never,
      );

      const result = await service.reconcile({
        actorId: "operator-1",
        paymentId: payment.id,
        idempotencyKey: "operator-reconcile-key",
        correlationId: "correlation-1",
      });

      expect(verification.process).toHaveBeenCalledWith(payment.id);
      expect(result).toMatchObject({ state: "completed", paymentId: payment.id });
      expect(operations.finish).toHaveBeenCalledWith("attempt-1", "completed", {
        paymentState: "verified",
      });
    },
  );
});
