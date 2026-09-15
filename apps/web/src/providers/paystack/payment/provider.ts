import { createHmac, timingSafeEqual } from "node:crypto";
import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import { ExactCurrencyConverter } from "@/modules/money/exchange";
import type { ExchangeRateService } from "@/modules/money/exchange-service";
import { AbstractPaymentProvider } from "@/modules/payment/payment";
import type { PaymentInitialization, PaymentResult } from "@/modules/payment/payment";
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

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}
interface InitializeData {
  authorization_url: string;
  access_code: string;
  reference: string;
}
interface TransactionData {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  fees?: number | null;
}

export class PaystackProvider extends AbstractPaymentProvider {
  readonly name = "paystack";
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  readonly collectionCurrencies: readonly string[];
  readonly defaultCollectionCurrency: string;
  readonly customerActionLabel = "Pay now";
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
    const body: Record<string, string> = {
      email: input.buyerEmail,
      amount: toPaystackSubunit(input.amount),
      currency: input.amount.currency,
      reference,
    };
    if (this.config.callbackUrl) body.callback_url = this.config.callbackUrl;
    const result = await this.request<InitializeData>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify(body),
    });
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
    const data = await this.request<TransactionData>(
      `/transaction/verify/${encodeURIComponent(input.reference)}`,
      { method: "GET" },
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
      },
    };
  }

  verifyWebhookSignature(rawBody: Uint8Array, signature: string | null): boolean {
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
    const expected = createHmac("sha512", this.config.secretKey).update(rawBody).digest();
    const presented = Buffer.from(signature, "hex");
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.http(new URL(path, this.config.apiBaseUrl), {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.secretKey}`,
          "content-type": "application/json",
        },
      });
    } catch {
      throw new ProviderOperationError(
        "paystack",
        path.includes("initialize") ? "transaction.initialize" : "transaction.verify",
        undefined,
        undefined,
        "Provider transport failure",
        undefined,
        "ambiguous",
      );
    }
    let envelope: PaystackEnvelope<T>;
    try {
      envelope = (await response.json()) as PaystackEnvelope<T>;
    } catch {
      throw new ProviderOperationError(
        "paystack",
        path.includes("initialize") ? "transaction.initialize" : "transaction.verify",
        response.status,
        undefined,
        "Invalid provider response",
      );
    }
    if (!response.ok || !envelope.status || !envelope.data)
      throw new ProviderOperationError(
        "paystack",
        path.includes("initialize") ? "transaction.initialize" : "transaction.verify",
        response.status,
        envelope.status,
        typeof envelope.message === "string" ? envelope.message : "Provider rejected request",
      );
    return envelope.data;
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
