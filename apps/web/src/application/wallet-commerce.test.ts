import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import type { ExchangeRateService } from "@/modules/money/exchange-service";
import { PaymentProviderRegistry, type PaymentProvider } from "@/modules/payment/payment";
import { PaystackProvider } from "@/providers/paystack/payment/provider";
import { FundingInitializationProcessor, FundingService } from "./wallet-commerce";

const accountId = "00000000-0000-4000-8000-000000000001";
const fundingId = "00000000-0000-4000-8000-000000000002";
const provider: PaymentProvider = {
  name: "test-provider",
  displayName: "Test provider",
  imageUrl: "/test.svg",
  description: "Test provider",
  collectionCurrencies: ["USD"],
  paymentCurrencies: [{ code: "usdttrc20" }],
  defaultPaymentCurrency: "usdttrc20",
  initiate: async () => ({ reference: "reference" }),
  verify: async ({ reference, expectedAmount }) => ({
    verified: false,
    reference,
    amount: expectedAmount,
    status: "pending",
  }),
};

function existingFunding(overrides: Partial<any> = {}) {
  return {
    id: fundingId,
    accountId,
    providerName: provider.name,
    providerReference: "reference",
    canonicalAmount: Money.of(100n, "USD"),
    collectionAmount: Money.of(100n, "USD"),
    state: "awaiting_payment" as const,
    idempotencyKey: "same-key",
    providerInitialization: { paymentCurrency: "usdttrc20" },
    ...overrides,
  };
}

function service(existing: any) {
  const funding = {
    findByIdempotency: async () => existing,
    findById: async () => null,
    findByProviderReference: async () => null,
    findWork: async () => [],
    findInitializationWork: async () => [],
    claimInitialization: async () => null,
    save: async () => undefined,
  };
  const providers = new PaymentProviderRegistry().register(provider);
  return new FundingService(
    funding,
    providers,
    {
      quote: async () => {
        throw new Error("unexpected quote");
      },
    } as unknown as ExchangeRateService,
    {
      findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
      exists: async () => true,
    },
    { transaction: async (operation) => operation() },
  );
}

describe("funding idempotency semantics", () => {
  it("returns the prior funding for identical provider and currency facts", async () => {
    const existing = existingFunding();
    await expect(
      service(existing).create({
        accountId,
        amountMinor: 100n,
        providerName: provider.name,
        idempotencyKey: "same-key",
        paymentCurrency: "USDTTRC20",
      }),
    ).resolves.toBe(existing);
  });

  it("rejects an idempotency key reused with incompatible amount or currency", async () => {
    await expect(
      service(existingFunding()).create({
        accountId,
        amountMinor: 101n,
        providerName: provider.name,
        idempotencyKey: "same-key",
        paymentCurrency: "usdttrc20",
      }),
    ).rejects.toThrow("Idempotency key conflicts");
    await expect(
      service(existingFunding()).create({
        accountId,
        amountMinor: 100n,
        providerName: provider.name,
        idempotencyKey: "same-key",
        paymentCurrency: "unsupported",
      }),
    ).rejects.toThrow("unsupported");
  });
});

describe("funding minimum preflight", () => {
  it("blocks below-minimum funding without calling provider payment initialization", async () => {
    const initiate = vi.fn(async () => ({ reference: "reference" }));
    const minimumPaymentAmount = async () => Money.of(101n, "USD");
    const preflightProvider: PaymentProvider = {
      ...provider,
      initiate,
      minimumPaymentAmount,
    };
    let funding: any = {
      ...existingFunding(),
      state: "initialization_pending" as const,
      initializationClaimedAt: undefined,
    };
    let saved = false;
    const repository = {
      findById: async () => funding,
      findByIdempotency: async () => null,
      findByProviderReference: async () => null,
      findWork: async () => [],
      findInitializationWork: async () => [],
      claimInitialization: async () => {
        funding = {
          ...funding,
          state: "initializing" as const,
          initializationClaimedAt: new Date(),
        };
        return funding;
      },
      save: async (value: any) => {
        funding = value;
        saved = true;
      },
    };
    const operations = { recordFundingFailure: async () => undefined };
    const processor = new FundingInitializationProcessor(
      repository,
      new PaymentProviderRegistry().register(preflightProvider),
      {
        findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
        findAuthenticationEmail: async () => "buyer@example.test",
        exists: async () => true,
      },
      { transaction: async (operation) => operation() },
      operations as never,
    );

    await expect(processor.process(fundingId)).rejects.toMatchObject({
      providerCode: "AMOUNT_MINIMAL_ERROR",
    });
    expect(saved).toBe(true);
    expect(funding.state).toBe("blocked");
    expect(funding.providerInitialization).toMatchObject({
      failureCode: "AMOUNT_MINIMAL_ERROR",
      failureMessage: "The minimum funding amount is $1.01.",
      failureAmountMinor: "101",
      failureCurrency: "USD",
    });
    expect(initiate).not.toHaveBeenCalled();
  });
});

describe("provider-owned funding preparation", () => {
  it("keeps canonical USD separate from Paystack's NGN collection quote", async () => {
    const quote = {
      fromCurrency: "USD",
      toCurrency: "NGN",
      rate: "1600",
      source: "test-rate",
      sourceDate: "2026-09-12",
      observedAt: new Date("2026-09-12T10:00:00Z"),
    };
    const providerRate = vi.fn(async () => quote);
    const registry = new PaymentProviderRegistry().register(
      new PaystackProvider(
        { secretKey: "test", apiBaseUrl: "https://api.paystack.co" },
        fetch,
        ["NGN"],
        { quote: providerRate } as unknown as ExchangeRateService,
      ),
      { filters: { countries: ["NG"] } },
    );
    const coreRate = vi.fn(async () => {
      throw new Error("unexpected core quote");
    });
    const service = new FundingService(
      {} as never,
      registry,
      { quote: coreRate } as unknown as ExchangeRateService,
      {
        findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
        exists: async () => true,
      },
      {} as never,
    );

    const prepared = await service.prepare({
      accountId,
      amountMinor: 8000n,
      providerName: "paystack",
    });

    expect(prepared.canonicalAmount).toEqual(Money.of(8000n, "USD"));
    expect(prepared.collectionAmount).toEqual(Money.of(12800000n, "NGN"));
    expect(prepared.conversionSnapshot).toMatchObject({
      fromCurrency: "USD",
      toCurrency: "NGN",
      rate: "1600",
      source: "test-rate",
    });
    expect(providerRate).toHaveBeenCalledWith("USD", "NGN");
    expect(coreRate).not.toHaveBeenCalled();
  });
});

describe("customer funding cancellation", () => {
  it("cancels only the selected pending attempt and never confirmed value", async () => {
    const siblingId = "00000000-0000-4000-8000-000000000003";
    const confirmedId = "00000000-0000-4000-8000-000000000004";
    const records = new Map<string, any>([
      [fundingId, existingFunding()],
      [siblingId, existingFunding({ id: siblingId, providerReference: "reference-2" })],
      [confirmedId, existingFunding({ id: confirmedId, state: "confirmed" })],
    ]);
    const cancellations: Array<{ id: string; previousState: string }> = [];
    const repository = {
      findById: async (id: string) => records.get(id) ?? null,
      save: async (value: any) => records.set(value.id, value),
      recordCancellation: async (id: string, _accountId: string, previousState: string) => {
        cancellations.push({ id, previousState });
      },
    };
    const service = new FundingService(
      repository as never,
      new PaymentProviderRegistry().register(provider),
      {} as never,
      {} as never,
      { transaction: async (operation) => operation() },
    );

    await expect(service.cancel({ accountId, fundingId })).resolves.toMatchObject({
      id: fundingId,
      state: "cancelled",
    });
    expect(records.get(siblingId)?.state).toBe("awaiting_payment");
    expect(records.get(confirmedId)?.state).toBe("confirmed");
    expect(cancellations).toEqual([{ id: fundingId, previousState: "awaiting_payment" }]);
    await expect(service.cancel({ accountId, fundingId: confirmedId })).rejects.toThrow(
      "cannot be cancelled",
    );
  });
});
