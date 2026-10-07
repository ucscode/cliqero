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
            createdAt: "2026-01-01T00:00:00.000Z",
            completedAt: null,
          },
        }),
        finish: vi.fn(async () => undefined),
        findById: vi.fn(async () => ({
          id: "attempt-1",
          paymentId: "payment-1",
          idempotencyKey: "operator-reconcile-key",
          state: "completed" as const,
          result: { paymentState: "verified" },
          lastError: null,
          actorId: "operator-1",
          correlationId: "correlation-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:01:00.000Z",
        })),
        list: vi.fn(async () => ({ items: [], nextCursor: null })),
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

  it("rejects an idempotency key already bound to a different payment", async () => {
    const payment: PaymentRecord = {
      id: "payment-current",
      providerName: "paystack",
      providerReference: "paystack-reference",
      buyerId: "buyer-1",
      listingId: "listing-1",
      amount: Money.of(1000n, "USD"),
      canonicalAmount: Money.of(1000n, "USD"),
      state: "awaiting_payment",
      idempotencyKey: "payment-create-key",
    };
    const verification = { process: vi.fn() };
    const attempt = {
      id: "attempt-existing",
      paymentId: "payment-other",
      idempotencyKey: "shared-key",
      state: "started" as const,
      result: null,
      lastError: null,
      actorId: "operator-1",
      correlationId: "prior-correlation",
      createdAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
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
      {
        begin: async () => ({ attempt, created: false }),
        finish: vi.fn(),
        findById: async () => attempt,
        list: async () => ({ items: [], nextCursor: null }),
      },
      { requireCapability: async () => undefined } as never,
    );

    await expect(
      service.reconcile({
        actorId: "operator-1",
        paymentId: payment.id,
        idempotencyKey: "shared-key",
        correlationId: "new-correlation",
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
    expect(verification.process).not.toHaveBeenCalled();
  });
});
