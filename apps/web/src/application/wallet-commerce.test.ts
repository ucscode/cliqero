import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import type { ExchangeRateService } from "@/modules/money/exchange-service";
import { PaymentProviderRegistry, type PaymentProvider } from "@/modules/payment";
import { PaystackProvider } from "@/providers/payment/paystack/provider";
import { NowPaymentsProvider } from "@/providers/payment/nowpayments/provider";
import { NowPaymentsExpiryProcessor } from "@/providers/payment/nowpayments/expiry";
import { BankTransferProvider } from "@/providers/payment/bank-transfer/provider";
import {
  FundingInitializationProcessor,
  FundingService,
  FundingVerificationProcessor,
} from "./wallet-commerce";

const accountId = "00000000-0000-4000-8000-000000000001";
const fundingId = "00000000-0000-4000-8000-000000000002";
const provider: PaymentProvider = {
  name: "test-provider",
  displayName: "Test provider",
  imageUrl: "/test.svg",
  description: "Test provider",
  collectionCurrencies: ["USD"],
  paymentCurrencies: [{ code: "usdttrc20" }],
  initiate: async () => ({ reference: "reference" }),
  handleRequest: async (payload: unknown, context: any) => ({
    state: "confirmed" as const,
    reference: context.reference,
    amount: context.expectedAmount,
    providerTransactionId:
      payload && typeof payload === "object" && "transaction_hash" in payload
        ? String((payload as { transaction_hash: unknown }).transaction_hash).trim()
        : undefined,
  }),
  verify: async ({ reference, expectedAmount }) => ({
    state: "pending" as const,
    reference,
    amount: expectedAmount,
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
    findByProviderTransactionId: async () => null,
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
      findByProviderTransactionId: async () => null,
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

describe("NOWPayments funding expiry", () => {
  const now = new Date("2026-09-13T10:00:00.000Z");

  function harness(
    expiresAt: string,
    result: { state: "pending" | "confirmed" | "failed"; reference?: string; amount?: Money },
    providerName = "nowpayments",
  ) {
    let current: any = existingFunding({
      providerName,
      providerInitialization: { expiresAt },
    });
    const verify = vi.fn(async () => ({
      state: result.state,
      reference: result.reference ?? current.providerReference,
      amount: result.amount ?? current.collectionAmount,
    }));
    const repository = {
      findById: async () => current,
      save: async (value: any) => {
        current = value;
      },
    };
    const paymentProvider: PaymentProvider = {
      ...provider,
      name: providerName,
      verify,
    };
    const verification = new FundingVerificationProcessor(
      repository as never,
      new PaymentProviderRegistry().register(paymentProvider),
      { transaction: async (operation) => operation() },
    );
    const expiry = new NowPaymentsExpiryProcessor(repository as never, verification, () => now);
    return { current: () => current, expiry, verify };
  }

  it("does not verify a future-expiry session", async () => {
    const test = harness("2026-09-13T10:01:00.000Z", { state: "pending" });

    await expect(test.expiry.process(fundingId)).resolves.toBeNull();
    expect(test.verify).not.toHaveBeenCalled();
    expect(test.current().state).toBe("awaiting_payment");
  });

  it("performs final verification and expires an unresolved session", async () => {
    const test = harness("2026-09-13T09:59:00.000Z", { state: "pending" });

    await expect(test.expiry.process(fundingId)).resolves.toMatchObject({ state: "expired" });
    expect(test.verify).toHaveBeenCalledTimes(1);
    expect(test.current().state).toBe("expired");
  });

  it("confirms a successful final verification instead of expiring", async () => {
    const test = harness("2026-09-13T09:59:00.000Z", { state: "confirmed" });

    await expect(test.expiry.process(fundingId)).resolves.toMatchObject({ state: "confirmed" });
    expect(test.current().state).toBe("confirmed");
  });

  it("never expires a funding that was confirmed before the final lock", async () => {
    const awaiting = existingFunding({
      providerName: "nowpayments",
      providerInitialization: { expiresAt: "2026-09-13T09:59:00.000Z" },
    });
    const confirmed = existingFunding({
      providerName: "nowpayments",
      state: "confirmed",
      providerInitialization: { expiresAt: "2026-09-13T09:59:00.000Z" },
    });
    let lockRead = false;
    const repository = {
      findById: async (_id: string, options?: { forUpdate?: boolean }) => {
        if (options?.forUpdate) {
          lockRead = true;
          return confirmed;
        }
        return awaiting;
      },
      save: async () => undefined,
    };
    const verification = new FundingVerificationProcessor(
      repository as never,
      new PaymentProviderRegistry().register({
        ...provider,
        name: "nowpayments",
        verify: async () => ({
          state: "pending" as const,
          reference: confirmed.providerReference,
          amount: confirmed.collectionAmount,
        }),
      }),
      { transaction: async (operation) => operation() },
    );
    await expect(verification.process(fundingId, { now })).resolves.toMatchObject({
      state: "confirmed",
    });
    expect(lockRead).toBe(true);
  });

  it("does not apply NOWPayments expiry rules to other providers", async () => {
    const test = harness(
      "2026-09-13T09:59:00.000Z",
      {
        state: "pending",
      },
      "paystack",
    );

    await expect(test.expiry.process(fundingId)).resolves.toBeNull();
    expect(test.verify).not.toHaveBeenCalled();
    expect(test.current().state).toBe("awaiting_payment");
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

  it("derives a bank account's collection currency without a generic currency input", async () => {
    const bank = new BankTransferProvider({
      currencyMapping: { enabled: true },
      accounts: [
        {
          id: "ng-account",
          fields: [{ key: "bank_name", label: "Bank", value: "Example Bank" }],
          filters: { countries: ["NG"] },
        },
      ],
    });
    const registry = new PaymentProviderRegistry().register(bank, {
      filters: { countries: ["NG"] },
    });
    const service = new FundingService(
      {} as never,
      registry,
      {
        quote: async () => ({
          fromCurrency: "USD",
          toCurrency: "NGN",
          rate: "1600",
          source: "test-rate",
          observedAt: new Date("2026-09-12T10:00:00Z"),
        }),
      } as unknown as ExchangeRateService,
      {
        findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
        exists: async () => true,
      },
      {} as never,
    );

    const prepared = await service.prepare({
      accountId,
      amountMinor: 2500n,
      providerName: "bank_transfer",
      fundingOptionId: "ng-account",
    });

    expect(prepared.collectionAmount.currency).toBe("NGN");
    expect(prepared.collectionAmount.minorAmount).toBe(4000000n);
  });

  it("snapshots the selected bank account fields at funding creation", async () => {
    let created: any;
    const bank = new BankTransferProvider({
      instruction: "Use the provider instruction.",
      currencyMapping: { enabled: true },
      accounts: [
        {
          id: "ng-account",
          instruction: "Use the account instruction.",
          fields: [
            { key: "bank_name", label: "Bank Name", value: "Example Bank" },
            { key: "custom_route", label: "Custom route", value: "ROUTE-123", copyable: false },
            { key: "account_number", label: "Account Number", value: "0000000000", copyable: true },
          ],
          filters: { countries: ["NG"] },
        },
      ],
    });
    const repository = {
      findByIdempotency: async () => null,
      save: async (value: any) => {
        created = value;
      },
    };
    const service = new FundingService(
      repository as never,
      new PaymentProviderRegistry().register(bank, { filters: { countries: ["NG"] } }),
      {
        quote: async () => ({
          fromCurrency: "USD",
          toCurrency: "NGN",
          rate: "1600",
          source: "test-rate",
          observedAt: new Date("2026-09-12T10:00:00Z"),
        }),
      } as unknown as ExchangeRateService,
      {
        findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
        exists: async () => true,
      },
      { transaction: async (operation) => operation() },
    );

    await service.create({
      accountId,
      amountMinor: 2500n,
      providerName: "bank_transfer",
      fundingOptionId: "ng-account",
      idempotencyKey: "bank-snapshot-1",
    });

    expect(created.providerInitialization).toMatchObject({
      providerAccountId: "ng-account",
      providerAccountSnapshot: {
        id: "ng-account",
        collectionCurrency: "NGN",
        instruction: "Use the account instruction.",
        fields: [
          { key: "bank_name", label: "Bank Name", value: "Example Bank" },
          { key: "custom_route", label: "Custom route", value: "ROUTE-123", copyable: false },
          { key: "account_number", label: "Account Number", value: "0000000000", copyable: true },
        ],
      },
    });
  });

  it("keeps the creation snapshot when provider config changes before initialization", async () => {
    let funding: any;
    const oldBank = new BankTransferProvider({
      accounts: [
        {
          id: "ng-account",
          fields: [{ key: "account_number", label: "Account Number", value: "1234567890" }],
          filters: { countries: ["NG"] },
        },
      ],
    });
    const repository = {
      findByIdempotency: async () => null,
      findById: async () => funding,
      save: async (value: any) => {
        funding = value;
      },
      claimInitialization: async () => {
        funding = { ...funding, state: "initializing", initializationClaimedAt: new Date() };
        return funding;
      },
    };
    const service = new FundingService(
      repository as never,
      new PaymentProviderRegistry().register(oldBank),
      {} as never,
      {
        findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
        exists: async () => true,
      },
      { transaction: async (operation) => operation() },
    );

    await service.create({
      accountId,
      amountMinor: 2500n,
      providerName: "bank_transfer",
      fundingOptionId: "ng-account",
      idempotencyKey: "bank-snapshot-2",
    });
    const originalSnapshot = funding.providerInitialization.providerAccountSnapshot;
    const changedBank = new BankTransferProvider({
      accounts: [
        {
          id: "ng-account",
          fields: [{ key: "account_number", label: "Account Number", value: "9876543210" }],
          filters: { countries: ["NG"] },
        },
      ],
    });
    const processor = new FundingInitializationProcessor(
      repository as never,
      new PaymentProviderRegistry().register(changedBank),
      {
        findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
        findAuthenticationEmail: async () => "buyer@example.test",
        exists: async () => true,
      },
      { transaction: async (operation) => operation() },
    );

    await processor.process(funding.id);

    expect(funding.providerInitialization.providerAccountSnapshot).toEqual(originalSnapshot);
  });

  it("persists the selected NOWPayments currency on the funding record", async () => {
    const repository = {
      findByIdempotency: async () => null,
      save: async (value: any) => value,
    };
    const service = new FundingService(
      repository as never,
      new PaymentProviderRegistry().register(
        new NowPaymentsProvider({
          apiKey: "test",
          apiBaseUrl: "https://api-sandbox.nowpayments.io",
          payCurrencies: ["btc", "eth", "usdttrc20"],
        }),
      ),
      {} as never,
      {
        findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
        exists: async () => true,
      },
      { transaction: async (operation) => operation() },
    );

    const created = await service.create({
      accountId,
      amountMinor: 1000n,
      providerName: "nowpayments",
      idempotencyKey: "now-btc-selection",
      paymentCurrency: "btc",
    });

    expect(created.providerInitialization?.paymentCurrency).toBe("btc");
  });
});

describe("provider transaction identity", () => {
  it("persists the provider transaction ID returned during initialization", async () => {
    let current: any = existingFunding({
      providerName: "nowpayments",
      providerInitialization: { paymentCurrency: "usdttrc20" },
      state: "initialization_pending",
    });
    const repository = {
      findInitializationWork: async () => [current],
      claimInitialization: async () => {
        current = { ...current, state: "initializing", initializationClaimedAt: new Date() };
        return current;
      },
      findById: async () => current,
      save: async (value: any) => {
        current = value;
      },
    };
    const processor = new FundingInitializationProcessor(
      repository as never,
      new PaymentProviderRegistry().register({
        ...provider,
        name: "nowpayments",
        initiate: async () => ({
          reference: current.providerReference,
          providerTransactionId: "Np-AbC123",
        }),
      }),
      {
        findById: async () => ({ id: accountId, username: "buyer", country: "NG" }),
        findAuthenticationEmail: async () => "buyer@example.test",
        exists: async () => true,
      },
      { transaction: async (operation) => operation() },
    );

    await expect(processor.process(fundingId)).resolves.toMatchObject({
      state: "awaiting_payment",
      providerTransactionId: "Np-AbC123",
    });
  });

  it("persists a verification identity only after successful verification", async () => {
    let current: any = existingFunding({
      state: "verification_pending",
      providerTransactionId: null,
    });
    const save = vi.fn(async (value: any) => {
      current = value;
    });
    const repository = {
      findById: async () => current,
      findByProviderTransactionId: async () => null,
      save,
    };
    const verification = new FundingVerificationProcessor(
      repository as never,
      new PaymentProviderRegistry().register({
        ...provider,
        verify: async () => ({
          state: "confirmed",
          reference: current.providerReference,
          amount: current.collectionAmount,
          providerTransactionId: "paystack-123",
        }),
      }),
      { transaction: async (operation) => operation() },
    );

    await expect(verification.process(fundingId)).resolves.toMatchObject({
      state: "confirmed",
      providerTransactionId: "paystack-123",
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ providerTransactionId: "paystack-123" }),
    );
  });

  it("never persists a confirming observation without an accepted identity", async () => {
    let current: any = existingFunding({
      state: "verification_pending",
      providerTransactionId: null,
    });
    const repository = {
      findById: async () => current,
      save: async (value: any) => {
        current = value;
      },
    };
    const verification = new FundingVerificationProcessor(
      repository as never,
      new PaymentProviderRegistry().register({
        ...provider,
        verify: async () => ({
          state: "pending",
          reference: current.providerReference,
          amount: current.collectionAmount,
          observation: { status: "confirming" as const, message: "Not yet final." },
        }),
      }),
      { transaction: async (operation) => operation() },
    );

    await expect(verification.process(fundingId)).resolves.toMatchObject({
      state: "awaiting_payment",
      providerTransactionId: null,
    });
    expect(current.providerInitialization.verification).toMatchObject({
      status: "awaiting_transaction",
    });
  });

  it("fails verification when the provider returns a different known identity", async () => {
    let current: any = existingFunding({
      state: "verification_pending",
      providerTransactionId: "PayStack-Original",
    });
    const repository = {
      findById: async () => current,
      save: async (value: any) => {
        current = value;
      },
    };
    const verification = new FundingVerificationProcessor(
      repository as never,
      new PaymentProviderRegistry().register({
        ...provider,
        verify: async () => ({
          state: "confirmed",
          reference: current.providerReference,
          amount: current.collectionAmount,
          providerTransactionId: "paystack-original",
        }),
      }),
      { transaction: async (operation) => operation() },
    );

    await expect(verification.process(fundingId)).resolves.toMatchObject({ state: "failed" });
    expect(current.providerTransactionId).toBe("PayStack-Original");
  });

  it("rejects a direct TRC20 hash already claimed by another funding", async () => {
    const hash = "a".repeat(64);
    const current = existingFunding({ providerName: "usdt_trc20" });
    const repository = {
      findById: async () => current,
      findByProviderTransactionId: async () => ({ ...current, id: "other-funding" }),
      save: vi.fn(),
    };
    const unitOfWork = { transaction: async (operation: any) => operation() };
    const providers = new PaymentProviderRegistry().register({
      ...provider,
      name: "usdt_trc20",
      handleRequest: async (_payload, context) => ({
        state: "confirmed" as const,
        reference: context.reference,
        amount: context.expectedAmount,
        providerTransactionId: hash,
      }),
    });
    const verification = new FundingVerificationProcessor(
      repository as never,
      providers,
      unitOfWork,
    );
    const service = new FundingService(
      repository as never,
      providers,
      {} as never,
      {} as never,
      unitOfWork,
      verification,
    );

    await expect(
      service.submitProviderRequest({ accountId, fundingId, payload: { transaction_hash: hash } }),
    ).rejects.toThrow("This provider transaction has already been used.");
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("rejects an unadmitted hash without persisting it", async () => {
    const hash = "AbCd".repeat(16);
    const current: any = existingFunding({ providerName: "usdt_trc20" });
    const repository = {
      findById: async () => current,
      findByProviderTransactionId: async () => null,
      save: vi.fn(),
    };
    const verification = new FundingVerificationProcessor(
      repository as never,
      new PaymentProviderRegistry().register({
        ...provider,
        name: "usdt_trc20",
        handleRequest: async (_payload, context) => ({
          state: "failed" as const,
          reference: context.reference,
          amount: context.expectedAmount,
          observation: { status: "not_found" as const, message: "Transaction not found." },
        }),
        verify: async ({ reference, expectedAmount }) => ({
          state: "failed",
          reference,
          amount: expectedAmount,
          observation: { status: "mismatch" as const, message: "Wrong destination." },
        }),
      }),
      { transaction: async (operation) => operation() },
    );
    const service = new FundingService(
      repository as never,
      new PaymentProviderRegistry().register({
        ...provider,
        name: "usdt_trc20",
        handleRequest: async (_payload, context) => ({
          state: "failed" as const,
          reference: context.reference,
          amount: context.expectedAmount,
          observation: { status: "not_found" as const, message: "Transaction not found." },
        }),
      }),
      {} as never,
      {} as never,
      { transaction: async (operation) => operation() },
      verification,
    );

    await expect(
      service.submitProviderRequest({
        accountId,
        fundingId,
        payload: { transaction_hash: `  ${hash}  ` },
      }),
    ).resolves.toMatchObject({ state: "failed" });
    expect(current.providerTransactionId).toBeUndefined();
    expect(repository.save).toHaveBeenCalled();
  });

  it("preserves the exact case of separately accepted transaction identities", async () => {
    const lower = "ab".repeat(32);
    const upper = "AB".repeat(32);
    const records = new Map<string, any>([
      ["funding-lower", existingFunding({ id: "funding-lower", providerName: "usdt_trc20" })],
      ["funding-upper", existingFunding({ id: "funding-upper", providerName: "usdt_trc20" })],
    ]);
    const claimed = new Map<string, any>();
    const repository = {
      findById: async (id: string) => records.get(id) ?? null,
      findByProviderTransactionId: async (_provider: string, transactionId: string) =>
        claimed.get(transactionId) ?? null,
      save: vi.fn(async (value: any) => {
        records.set(value.id, value);
        if (value.providerTransactionId) claimed.set(value.providerTransactionId, value);
      }),
    };
    const acceptedProvider: PaymentProvider = {
      ...provider,
      name: "usdt_trc20",
      handleRequest: async (payload, context) => ({
        state: "confirmed" as const,
        reference: context.reference,
        amount: context.expectedAmount,
        providerTransactionId:
          payload && typeof payload === "object" && "transaction_hash" in payload
            ? String((payload as { transaction_hash: unknown }).transaction_hash).trim()
            : undefined,
      }),
      verify: async ({ reference, expectedAmount, providerTransactionId }) => ({
        state: "confirmed",
        reference,
        amount: expectedAmount,
        providerTransactionId,
      }),
    };
    const unitOfWork = { transaction: async (operation: any) => operation() };
    const verification = new FundingVerificationProcessor(
      repository as never,
      new PaymentProviderRegistry().register(acceptedProvider),
      unitOfWork,
    );
    const service = new FundingService(
      repository as never,
      new PaymentProviderRegistry().register(acceptedProvider),
      {} as never,
      {} as never,
      unitOfWork,
      verification,
    );

    await service.submitProviderRequest({
      accountId,
      fundingId: "funding-lower",
      payload: { transaction_hash: lower },
    });
    await service.submitProviderRequest({
      accountId,
      fundingId: "funding-upper",
      payload: { transaction_hash: upper },
    });

    expect(records.get("funding-lower")?.providerTransactionId).toBe(lower);
    expect(records.get("funding-upper")?.providerTransactionId).toBe(upper);
  });
});

describe("foreground funding verification", () => {
  it("accepts and persists a submitted hash after immediate provider admission", async () => {
    const hash = "AbCd".repeat(16);
    let current: any = existingFunding({ providerName: "usdt_trc20" });
    const verify = vi.fn(async () => ({
      state: "confirmed" as const,
      reference: current.providerReference,
      amount: current.collectionAmount,
      providerTransactionId: hash,
      observation: { status: "success" as const, message: "Payment verified successfully." },
    }));
    const repository = {
      findById: async () => current,
      findByProviderTransactionId: async () => null,
      save: vi.fn(async (value: any) => {
        current = value;
      }),
    };
    const unitOfWork = { transaction: async (operation: any) => operation() };
    const acceptedProvider: PaymentProvider = {
      ...provider,
      name: "usdt_trc20",
      verify,
      handleRequest: async () => verify(),
    };
    const providers = new PaymentProviderRegistry().register(acceptedProvider);
    const processor = new FundingVerificationProcessor(repository as never, providers, unitOfWork);
    const service = new FundingService(
      repository as never,
      providers,
      {} as never,
      {} as never,
      unitOfWork,
      processor,
    );

    await expect(
      service.submitProviderRequest({ accountId, fundingId, payload: { transaction_hash: hash } }),
    ).resolves.toMatchObject({ state: "confirmed", providerTransactionId: hash });
    expect(verify).toHaveBeenCalledTimes(1);
    expect((current.providerInitialization as any)?.verification).toMatchObject({
      status: "success",
    });
    await expect(
      service.submitProviderRequest({ accountId, fundingId, payload: { transaction_hash: hash } }),
    ).rejects.toThrow("Funding is not available for provider interaction");
  });

  it("accepts a matching hash before final confirmation and leaves it worker-monitorable", async () => {
    const hash = "AbCd".repeat(16);
    let current: any = existingFunding({ providerName: "usdt_trc20" });
    const repository = {
      findById: async () => current,
      findByProviderTransactionId: async () => null,
      save: async (value: any) => {
        current = value;
      },
    };
    const unitOfWork = { transaction: async (operation: any) => operation() };
    const acceptedProvider: PaymentProvider = {
      ...provider,
      name: "usdt_trc20",
      handleRequest: async (_payload, context) => ({
        state: "pending" as const,
        reference: context.reference,
        amount: context.expectedAmount,
        providerTransactionId: hash,
        observation: {
          status: "confirming" as const,
          level: "info" as const,
          message: "Waiting for confirmations.",
          confirmations: 2,
          confirmationsRequired: 6,
        },
      }),
      verify: async ({ reference, expectedAmount, providerTransactionId }) => ({
        state: "pending" as const,
        reference,
        amount: expectedAmount,
        providerTransactionId,
        observation: {
          status: "confirming" as const,
          level: "info" as const,
          message: "Waiting for confirmations.",
          confirmations: 2,
          confirmationsRequired: 6,
        },
      }),
    };
    const providers = new PaymentProviderRegistry().register(acceptedProvider);
    const verification = new FundingVerificationProcessor(
      repository as never,
      providers,
      unitOfWork,
    );
    const service = new FundingService(
      repository as never,
      providers,
      {} as never,
      {} as never,
      unitOfWork,
      verification,
    );

    await expect(
      service.submitProviderRequest({ accountId, fundingId, payload: { transaction_hash: hash } }),
    ).resolves.toMatchObject({
      state: "verification_pending",
      providerTransactionId: hash,
    });
    expect(current.providerTransactionId).toBe(hash);
    expect(current.providerInitialization.verification).toMatchObject({
      status: "confirming",
      confirmations: 2,
      confirmationsRequired: 6,
    });
  });

  it("persists a provider-rejected not-found result without binding an identity", async () => {
    const hash = "AbCd".repeat(16);
    const current: any = existingFunding({ providerName: "usdt_trc20" });
    const repository = {
      findById: async () => current,
      save: vi.fn(),
      findByProviderTransactionId: async () => null,
    };
    const unitOfWork = { transaction: async (operation: any) => operation() };
    const acceptedProvider: PaymentProvider = {
      ...provider,
      name: "usdt_trc20",
      handleRequest: async (_payload, context) => ({
        state: "failed" as const,
        reference: context.reference,
        amount: context.expectedAmount,
        observation: {
          status: "not_found" as const,
          message: "Transaction not found on TRON yet.",
        },
      }),
      verify: async ({ reference, expectedAmount }) => ({
        state: "failed" as const,
        reference,
        amount: expectedAmount,
        observation: {
          status: "not_found" as const,
          message: "Transaction not found on TRON yet.",
        },
      }),
    };
    const providers = new PaymentProviderRegistry().register(acceptedProvider);
    const verification = new FundingVerificationProcessor(
      repository as never,
      providers,
      unitOfWork,
    );
    const service = new FundingService(
      repository as never,
      providers,
      {} as never,
      {} as never,
      unitOfWork,
      verification,
    );

    await expect(
      service.submitProviderRequest({ accountId, fundingId, payload: { transaction_hash: hash } }),
    ).resolves.toMatchObject({ state: "failed" });
    expect(current.providerTransactionId).toBeUndefined();
    expect(current.providerInitialization?.verification).toMatchObject({ status: "not_found" });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("keeps transient provider errors retryable while persisting customer-safe feedback", async () => {
    let current = existingFunding({
      providerName: "usdt_trc20",
      state: "verification_pending",
      providerTransactionId: "AbCd".repeat(16),
    });
    const repository = {
      findById: async () => current,
      save: async (value: any) => {
        current = value;
      },
    };
    const verification = new FundingVerificationProcessor(
      repository as never,
      new PaymentProviderRegistry().register({
        ...provider,
        name: "usdt_trc20",
        verify: async () => {
          throw new Error("private TRONGrid detail");
        },
      }),
      { transaction: async (operation) => operation() },
    );

    await expect(
      verification.process(fundingId, { rethrowProviderErrors: false }),
    ).resolves.toMatchObject({ state: "verification_pending" });
    expect((current.providerInitialization as any)?.verification).toMatchObject({
      status: "provider_error",
    });
  });
});

describe("customer funding cancellation", () => {
  it("cancels only the selected pending attempt and never confirmed value", async () => {
    const siblingId = "00000000-0000-4000-8000-000000000003";
    const confirmedId = "00000000-0000-4000-8000-000000000004";
    const expiredId = "00000000-0000-4000-8000-000000000005";
    const records = new Map<string, any>([
      [fundingId, existingFunding()],
      [siblingId, existingFunding({ id: siblingId, providerReference: "reference-2" })],
      [confirmedId, existingFunding({ id: confirmedId, state: "confirmed" })],
      [expiredId, existingFunding({ id: expiredId, state: "expired" })],
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
    await expect(service.cancel({ accountId, fundingId: expiredId })).rejects.toThrow(
      "cannot be cancelled",
    );
  });
});
