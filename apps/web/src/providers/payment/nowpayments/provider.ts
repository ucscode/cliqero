import {
  NowPaymentsApiError,
  NowPaymentsClient,
  NowPaymentsResponseError,
  NowPaymentsTransportError,
} from "@cliqero/nowpayments";
import type { NowPaymentsHttpClient } from "@cliqero/nowpayments";
import type { Id } from "@/kernel/ids";
import { ProviderOperationError } from "@/kernel/provider-error";
import { Money } from "@/modules/money/money";
import { AbstractPaymentProvider } from "@/modules/payment";
import type {
  PaymentInitialization,
  PaymentInitializationMetadata,
  PaymentResult,
} from "@/modules/payment";

export interface NowPaymentsConfiguration {
  apiKey: string;
  ipnSecret?: string;
  apiBaseUrl: string;
  ipnCallbackUrl?: string;
  payCurrencies: readonly string[];
  asset?: string;
  network?: string;
  /** Optional NOWPayments sandbox create-payment simulation settings. */
  sandbox?: {
    case: NowPaymentsSandboxCase;
  };
  displayName?: string;
  imageUrl?: string;
  description?: string;
}

/** Values documented by NOWPayments for its sandbox payment test procedure. */
export const NOWPAYMENTS_SANDBOX_CASES = ["success"] as const;
export type NowPaymentsSandboxCase = (typeof NOWPAYMENTS_SANDBOX_CASES)[number];
export type { NowPaymentsHttpClient } from "@cliqero/nowpayments";

export class NowPaymentsProvider extends AbstractPaymentProvider {
  readonly collectionCurrencies = ["USD"] as const;
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  readonly paymentCurrencies;
  readonly name: string;
  readonly customerActionLabel = "Create payment";
  private readonly client: NowPaymentsClient;

  constructor(
    private readonly config: NowPaymentsConfiguration,
    name = "nowpayments",
    http: NowPaymentsHttpClient = fetch,
  ) {
    super();
    this.name = name;
    this.client = new NowPaymentsClient({
      apiKey: config.apiKey,
      apiBaseUrl: config.apiBaseUrl,
      http,
    });
    this.displayName = config.displayName ?? "NOWPayments";
    this.imageUrl = config.imageUrl ?? "/images/payment/nowpayments.svg";
    this.description = config.description ?? "Pay through NOWPayments.";
    const configuredCurrencies = [...config.payCurrencies].map((currency) =>
      currency.trim().toLowerCase(),
    );
    if (configuredCurrencies.length === 0)
      throw new Error("NOWPayments requires at least one configured payment currency");
    this.paymentCurrencies = [
      ...new Set(
        configuredCurrencies.map((code) => ({
          code: code.toLowerCase(),
          label: formatCurrencyLabel(code),
          asset: configuredCurrencies.length === 1 ? config.asset : undefined,
          network: configuredCurrencies.length === 1 ? config.network : undefined,
        })),
      ),
    ] as const;
  }

  referenceFor(input: { paymentId: Id; idempotencyKey: string }) {
    return `np-${input.paymentId}`;
  }

  async minimumPaymentAmount(input: { currencyFrom: string; currencyTo: string }) {
    const currencyFrom = input.currencyFrom.trim().toLowerCase();
    const currencyTo = input.currencyTo.trim().toLowerCase();
    if (!currencyFrom || !currencyTo)
      throw new ProviderOperationError(
        this.name,
        "transaction.minimum_amount",
        undefined,
        undefined,
        "NOWPayments minimum amount currencies are missing",
        "minimum_amount_invalid",
      );
    const data = await this.call("transaction.minimum_amount", () =>
      this.client.getMinimumAmount({
        currencyFrom,
        currencyTo,
        fiatEquivalent: currencyFrom,
      }),
    );
    const minimum = decimalToCeilingMinor(data.fiat_equivalent);
    if (minimum === null)
      throw new ProviderOperationError(
        this.name,
        "transaction.minimum_amount",
        undefined,
        undefined,
        "NOWPayments returned an invalid minimum amount",
        "minimum_amount_invalid",
      );
    return Money.of(minimum, currencyFrom.toUpperCase());
  }

  async initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
    paymentCurrency?: string;
  }): Promise<PaymentInitialization> {
    const payCurrency = this.resolvePaymentCurrency(input.paymentCurrency);
    const reference = this.referenceFor(input);
    const priceAmount = decimalAmount(input.amount);
    const data = await this.call("transaction.initialize", () =>
      this.client.createPayment({
        priceAmount,
        priceCurrency: input.amount.currency.toLowerCase(),
        payCurrency,
        orderId: reference,
        orderDescription: `Cliqero wallet funding ${reference}`,
        ipnCallbackUrl: this.config.ipnCallbackUrl,
        sandboxCase:
          isNowPaymentsSandboxApi(this.config.apiBaseUrl) && this.config.sandbox?.case
            ? this.config.sandbox.case
            : undefined,
      }),
    );
    if (String(data.payment_id).length === 0 || data.order_id !== reference)
      throw new ProviderOperationError(
        this.name,
        "transaction.initialize",
        undefined,
        undefined,
        "Provider returned an unexpected payment reference",
      );
    if (!data.pay_address || data.pay_amount === null || data.pay_amount === undefined)
      throw new ProviderOperationError(
        this.name,
        "transaction.initialize",
        undefined,
        undefined,
        "Provider returned incomplete payment instructions",
      );
    const metadata: PaymentInitializationMetadata = {
      providerPaymentId: String(data.payment_id),
      paymentAddress: data.pay_address,
      paymentAmount: String(data.pay_amount),
      paymentCurrency: String(data.pay_currency ?? payCurrency).toUpperCase(),
      ...(data.asset || (this.paymentCurrencies.length === 1 && this.config.asset)
        ? { asset: data.asset ?? this.config.asset }
        : {}),
      ...(data.network || (this.paymentCurrencies.length === 1 && this.config.network)
        ? { network: data.network ?? this.config.network }
        : {}),
      expiresAt: data.expiration_estimate_date ?? undefined,
    };
    return { reference, providerTransactionId: String(data.payment_id), metadata };
  }

  async verify(input: {
    reference: string;
    expectedAmount: Money;
    providerTransactionId?: string;
    initialization?: PaymentInitializationMetadata;
  }): Promise<PaymentResult> {
    const providerPaymentId = input.providerTransactionId;
    if (!providerPaymentId) throw new Error("NOWPayments payment identifier is missing");
    const data = await this.call("transaction.verify", () =>
      this.client.getPaymentStatus(providerPaymentId),
    );
    if (data.order_id !== input.reference) throw new Error("NOWPayments order reference mismatch");
    const persistedPaymentCurrency = input.initialization?.paymentCurrency?.trim();
    if (!persistedPaymentCurrency)
      throw new Error("NOWPayments persisted payment currency is missing");
    const expectedPaymentCurrency = persistedPaymentCurrency.toLowerCase();
    if (String(data.pay_currency ?? "").toLowerCase() !== expectedPaymentCurrency)
      throw new Error("NOWPayments payment currency mismatch");
    const currency = String(data.price_currency ?? input.expectedAmount.currency).toUpperCase();
    const price = decimalToMinor(data.price_amount);
    if (price === null) throw new Error("NOWPayments returned an invalid amount");
    const status = String(data.payment_status ?? "").toLowerCase();
    const terminalSuccess = status === "finished";
    const terminalFailure = ["failed", "expired", "refunded", "partially_refunded"].includes(
      status,
    );
    return {
      state: terminalSuccess ? "confirmed" : terminalFailure ? "failed" : "pending",
      reference: input.reference,
      amount: Money.of(price, currency),
      providerTransactionId: String(data.payment_id),
      observation: {
        status: terminalSuccess ? "success" : terminalFailure ? "failed" : "confirming",
        message: terminalSuccess
          ? "Payment verified successfully."
          : terminalFailure
            ? "NOWPayments did not complete this payment."
            : "NOWPayments is still waiting for this payment.",
        level: terminalSuccess ? "success" : terminalFailure ? "error" : "info",
        resolved: terminalSuccess || terminalFailure,
      },
    };
  }

  private resolvePaymentCurrency(requested?: string) {
    const value = requested?.trim().toLowerCase();
    if (!value) throw new Error("NOWPayments payment currency is required");
    if (!this.paymentCurrencies.some((currency) => currency.code === value))
      throw new Error(`NOWPayments payment currency is unsupported: ${requested ?? value}`);
    return value;
  }

  verifyIpnSignature(rawBody: Uint8Array, signature: string | null): boolean {
    return this.config.ipnSecret
      ? this.client.verifyIpnSignature(rawBody, signature, this.config.ipnSecret)
      : false;
  }

  private async call<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof NowPaymentsTransportError)
        throw new ProviderOperationError(
          this.name,
          operation,
          undefined,
          undefined,
          "Provider transport failure",
          undefined,
          "ambiguous",
        );
      if (error instanceof NowPaymentsResponseError)
        throw new ProviderOperationError(
          this.name,
          operation,
          error.status,
          undefined,
          "Invalid provider response",
          "Invalid provider response",
        );
      if (error instanceof NowPaymentsApiError)
        throw new ProviderOperationError(
          this.name,
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

function formatCurrencyLabel(code: string) {
  const normalized = code.toLowerCase();
  if (normalized === "usdttrc20") return "USDT TRC20";
  if (normalized === "usdterc20") return "USDT ERC20";
  return code.toUpperCase();
}

export function isNowPaymentsSandboxApi(apiBaseUrl: string): boolean {
  try {
    return new URL(apiBaseUrl).hostname.toLowerCase() === "api-sandbox.nowpayments.io";
  } catch {
    return false;
  }
}

function decimalAmount(money: Money): string {
  const whole = money.minorAmount / 100n;
  const fraction = (money.minorAmount % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

function decimalToMinor(value: unknown): bigint | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function decimalToCeilingMinor(value: unknown): bigint | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = fraction.slice(0, 2).padEnd(2, "0");
  const remainder = fraction.slice(2).replace(/0+$/, "");
  return BigInt(whole) * 100n + BigInt(cents) + (remainder ? 1n : 0n);
}
