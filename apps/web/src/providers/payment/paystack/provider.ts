import {
  PaystackApiError,
  PaystackClient,
  PaystackResponseError,
  PaystackTransportError,
} from "@cliqero/paystack";
import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import { ExactCurrencyConverter } from "@/modules/money/exchange";
import type { ExchangeRateService } from "@/modules/money/exchange-service";
import { AbstractPaymentProvider } from "@/modules/payment";
import type { PaymentInitialization, PaymentResult } from "@/modules/payment";
import { ProviderOperationError } from "@/kernel/provider-error";
import {
  loadCountryCurrencyResolver,
  type CountryCurrencyResolver,
} from "@/modules/money/country-currency";

export interface PaystackConfiguration {
  publicKey?: string;
  secretKey: string;
  apiBaseUrl: string;
  callbackUrl?: string;
  displayName?: string;
  imageUrl?: string;
  description?: string;
  currencies?: readonly string[];
  defaultCurrency?: string;
}
export type PaystackHttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class PaystackProvider extends AbstractPaymentProvider {
  readonly name = "paystack";
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  readonly collectionCurrencies: readonly string[];
  readonly defaultCollectionCurrency: string;
  readonly customerActionLabel = "Pay now";
  private readonly client: PaystackClient;
  referenceFor(input: { paymentId: Id; idempotencyKey: string }) {
    return `pay-${input.paymentId}`;
  }
  constructor(
    private readonly config: PaystackConfiguration,
    private readonly http: PaystackHttpClient = fetch,
    collectionCurrencies: readonly string[] = ["NGN"],
    private readonly rates?: ExchangeRateService,
    private readonly countryCurrencies: CountryCurrencyResolver = loadCountryCurrencyResolver(),
  ) {
    super();
    this.client = new PaystackClient({
      secretKey: config.secretKey,
      apiBaseUrl: config.apiBaseUrl,
      http,
    });
    this.collectionCurrencies = normalizeCurrencies(config.currencies ?? collectionCurrencies);
    this.defaultCollectionCurrency = normalizeCurrency(
      config.defaultCurrency ?? this.collectionCurrencies[0],
    );
    if (!this.collectionCurrencies.includes(this.defaultCollectionCurrency))
      throw new Error(
        "Paystack default collection currency must be configured as an allowed currency",
      );
    this.displayName = config.displayName ?? "Paystack";
    this.imageUrl = config.imageUrl ?? "/images/payment/paystack.svg";
    this.description = config.description ?? "Pay through Paystack.";
  }

  async prepareFunding(input: {
    canonicalAmount: Money;
    collectionCurrency?: string;
    paymentCurrency?: string;
    country?: string | null;
  }) {
    const collectionCurrency =
      input.collectionCurrency?.trim().toUpperCase() ||
      this.collectionCurrenciesFor({ country: input.country ?? null })[0];
    if (!this.collectionCurrencies.includes(collectionCurrency))
      throw new Error(`Paystack does not support collection currency: ${collectionCurrency}`);
    if (collectionCurrency === input.canonicalAmount.currency)
      return { collectionAmount: input.canonicalAmount };
    if (!this.rates) throw new Error("Paystack exchange rate service is unavailable");
    const quote = await this.rates.quote(input.canonicalAmount.currency, collectionCurrency);
    return {
      collectionAmount: new ExactCurrencyConverter().convert(input.canonicalAmount, quote),
      conversionSnapshot: {
        fromCurrency: quote.fromCurrency,
        toCurrency: quote.toCurrency,
        rate: quote.rate,
        source: quote.source,
        sourceDate: quote.sourceDate,
        observedAt: quote.observedAt,
      },
    };
  }

  collectionCurrencyFor(input: { country: string | null }) {
    return this.collectionCurrenciesFor(input)[0] ?? this.defaultCollectionCurrency;
  }

  collectionCurrenciesFor(input: { country: string | null }) {
    const preferred = this.countryCurrencies.resolve(input.country, {
      provider: { enabled: true },
    });
    return [
      ...new Set([
        ...(this.collectionCurrencies.includes(preferred) ? [preferred] : []),
        this.defaultCollectionCurrency,
        ...this.collectionCurrencies,
      ]),
    ];
  }

  async initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
  }): Promise<PaymentInitialization> {
    if (input.amount.minorAmount <= 0n) throw new Error("Paystack amount must be positive");
    const reference = `pay-${input.paymentId}`;
    const result = await this.call("transaction.initialize", () =>
      this.client.initializeTransaction({
        email: input.buyerEmail,
        amountMinor: toPaystackSubunit(input.amount),
        currency: input.amount.currency,
        reference,
        callbackUrl: this.config.callbackUrl,
      }),
    );
    if (result.reference !== reference)
      throw new Error("Paystack returned an unexpected transaction reference");
    return {
      reference: result.reference,
      authorizationUrl: result.authorization_url,
      accessCode: result.access_code,
    };
  }

  async verify(input: {
    reference: string;
    expectedAmount: Money;
    providerTransactionId?: string;
  }): Promise<PaymentResult> {
    const data = await this.call("transaction.verify", () =>
      this.client.verifyTransaction(input.reference),
    );
    if (!Number.isSafeInteger(data.amount) || data.amount < 0)
      throw new Error("Paystack returned an invalid amount");
    if (
      typeof data.reference !== "string" ||
      typeof data.currency !== "string" ||
      typeof data.status !== "string"
    )
      throw new Error("Paystack verification response is invalid");
    if (
      data.fees !== undefined &&
      data.fees !== null &&
      (!Number.isSafeInteger(data.fees) || data.fees < 0)
    )
      throw new Error("Paystack returned an invalid fee");
    const status = data.status.toLowerCase();
    const confirmed = status === "success";
    const failed = ["failed", "abandoned", "reversed", "cancelled", "rejected"].includes(status);
    return {
      state: confirmed ? "confirmed" : failed ? "failed" : "pending",
      reference: data.reference,
      amount: Money.of(BigInt(data.amount), data.currency),
      providerTransactionId: String(data.id),
      providerFee:
        data.fees === undefined || data.fees === null
          ? undefined
          : Money.of(BigInt(data.fees), data.currency),
      observation: {
        status: confirmed ? "success" : failed ? "failed" : "confirming",
        message: confirmed
          ? "Payment verified successfully."
          : failed
            ? "Paystack did not complete this payment."
            : "Paystack is still processing this payment.",
        level: confirmed ? "success" : failed ? "error" : "info",
        resolved: confirmed || failed,
      },
    };
  }

  verifyWebhookSignature(rawBody: Uint8Array, signature: string | null): boolean {
    return this.client.verifyWebhookSignature(rawBody, signature);
  }

  private async call<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof PaystackTransportError)
        throw new ProviderOperationError(
          "paystack",
          operation,
          undefined,
          undefined,
          "Provider transport failure",
          undefined,
          "ambiguous",
        );
      if (error instanceof PaystackResponseError)
        throw new ProviderOperationError(
          "paystack",
          operation,
          error.status,
          undefined,
          "Invalid provider response",
        );
      if (error instanceof PaystackApiError)
        throw new ProviderOperationError(
          "paystack",
          operation,
          error.status,
          error.providerStatus,
          error.message,
          error.providerCode,
        );
      throw error;
    }
  }
}

function normalizeCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized))
    throw new Error("Paystack currency must be an ISO-style code");
  return normalized;
}

function normalizeCurrencies(currencies: readonly string[]) {
  const normalized = [...new Set(currencies.map(normalizeCurrency))];
  if (normalized.length === 0) throw new Error("Paystack currencies must not be empty");
  return normalized;
}

export function toPaystackSubunit(money: Money): string {
  return money.minorAmount.toString();
}
