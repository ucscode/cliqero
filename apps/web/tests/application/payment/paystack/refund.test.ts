import { describe, expect, it, vi } from "vitest";
import { PaystackRefundProcessedHandler } from "@/application/payment/paystack/refund";

const providerEventId = "00000000-0000-4000-8000-000000000010";
const fundingId = "00000000-0000-4000-8000-000000000020";

describe("Paystack refund funding adaptation", () => {
  it("normalizes refund.processed into the shared funding reversal workflow", async () => {
    const providerEvent = {
      id: providerEventId,
      providerName: "paystack",
      eventKey: "refund-key",
      eventType: "refund.processed",
      state: "received",
      providerReference: "pay-reference",
      amountMinor: "1000",
      currency: "NGN",
      payload: { data: { refund_reference: "paystack-refund-1" } },
    };
    const events = {
      findById: vi.fn(async () => providerEvent),
      markProcessed: vi.fn(async () => undefined),
      markRejected: vi.fn(async () => undefined),
    };
    const funding = {
      id: fundingId,
      collectionAmount: { minorAmount: 1000n, currency: "NGN" },
    };
    const findByProviderReference = vi.fn(async () => funding);
    const applyProviderEvent = vi.fn(async () => ({}));
    const payments = { findByProviderReference: vi.fn() };
    const purchases = { findByIdempotencyKey: vi.fn() };
    const purchaseReversal = { process: vi.fn() };
    const handler = new PaystackRefundProcessedHandler(
      events as never,
      payments as never,
      purchases as never,
      purchaseReversal as never,
      { findByProviderReference } as never,
      { applyProviderEvent } as never,
    );

    await handler.handle({
      payload: { providerEventId },
      correlationId: "00000000-0000-4000-8000-000000000030",
    } as never);

    expect(findByProviderReference).toHaveBeenCalledWith("paystack", "pay-reference");
    expect(applyProviderEvent).toHaveBeenCalledWith({
      eventId: providerEventId,
      providerName: "paystack",
      providerReference: "pay-reference",
      amountMinor: "1000",
      currency: "NGN",
      providerReversalReference: "paystack-refund-1",
      reason: "Paystack refund processed",
      full: true,
    });
    expect(events.markProcessed).toHaveBeenCalledWith(providerEventId);
    expect(events.markRejected).not.toHaveBeenCalled();
    expect(payments.findByProviderReference).not.toHaveBeenCalled();
    expect(purchaseReversal.process).not.toHaveBeenCalled();
  });
});
