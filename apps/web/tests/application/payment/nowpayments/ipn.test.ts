import { describe, expect, it, vi } from "vitest";
import type { FundingRepository, FundingTransaction } from "@/modules/funding/funding";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { NowPaymentsIpnIngress, interpretIpnStatus } from "@/application/payment/nowpayments/ipn";
import type { NowPaymentsProvider } from "@/providers/payment/nowpayments/provider";

const fundingId = "00000000-0000-4000-8000-000000000001";

function funding(state: FundingTransaction["state"] = "awaiting_payment") {
  return {
    id: fundingId,
    accountId: "00000000-0000-4000-8000-000000000002",
    providerName: "nowpayments",
    providerReference: "np-reference",
    canonicalAmount: { minorAmount: 100n, currency: "USD" },
    collectionAmount: { minorAmount: 100n, currency: "USD" },
    amount: { minorAmount: 100n, currency: "USD" },
    collectionCurrency: "USD",
    providerTransactionId: undefined,
    providerInitialization: undefined,
    idempotencyKey: "test-key",
    state,
  } as unknown as FundingTransaction;
}

function harness(current: FundingTransaction) {
  const saved: FundingTransaction[] = [];
  const repository: FundingRepository = {
    findById: vi.fn(async () => current),
    findByIdempotency: vi.fn(),
    findByProviderReference: vi.fn(async (_provider, reference) =>
      reference === current.providerReference ? current : null,
    ),
    findByProviderTransactionId: vi.fn(async (_provider, transactionId) =>
      transactionId === current.providerTransactionId ? current : null,
    ),
    findWork: vi.fn(),
    findInitializationWork: vi.fn(),
    claimInitialization: vi.fn(),
    save: vi.fn(async (value) => {
      Object.assign(current, value);
      saved.push(value);
    }),
  };
  const provider = {
    verifyIpnSignature: vi.fn(() => true),
  } as unknown as NowPaymentsProvider;
  const uow: UnitOfWork = { transaction: async (operation) => operation() };
  return { ingress: new NowPaymentsIpnIngress(provider, repository, uow), provider, saved };
}

describe("NowPayments IPN ingress", () => {
  it("keeps provider status interpretation out of the generic route", () => {
    expect(interpretIpnStatus("finished")).toBe("confirmed");
    expect(interpretIpnStatus("waiting")).toBe("pending");
    expect(interpretIpnStatus("unknown-provider-status")).toBe("reconciliation_required");
  });

  it("authenticates, binds the provider identity, and only admits verification", async () => {
    const current = funding();
    const test = harness(current);
    const result = await test.ingress.ingest(
      new TextEncoder().encode(
        JSON.stringify({
          order_id: "np-reference",
          payment_id: "PAYMENT-Case",
          payment_status: "waiting",
        }),
      ),
      "signature",
    );

    expect(result).toEqual({ status: 202, disposition: "pending" });
    expect(current.providerTransactionId).toBe("PAYMENT-Case");
    expect(current.state).toBe("verification_pending");
    expect(test.saved).toHaveLength(1);
  });

  it("returns a terminal response for repeated notifications without saving again", async () => {
    const current = funding("confirmed");
    const test = harness(current);
    const body = new TextEncoder().encode(
      JSON.stringify({
        order_id: "np-reference",
        payment_id: "PAYMENT-Case",
        payment_status: "finished",
      }),
    );

    await expect(test.ingress.ingest(body, "signature")).resolves.toEqual({
      status: 204,
      disposition: "confirmed",
    });
    expect(test.saved).toHaveLength(0);
  });

  it("rejects an unauthenticated body before parsing or mutating funding", async () => {
    const current = funding();
    const test = harness(current);
    vi.mocked(test.provider.verifyIpnSignature).mockReturnValue(false);

    await expect(
      test.ingress.ingest(new TextEncoder().encode('{"order_id":"np-reference"}'), null),
    ).resolves.toEqual({ status: 401 });
    expect(test.saved).toHaveLength(0);
  });
});
