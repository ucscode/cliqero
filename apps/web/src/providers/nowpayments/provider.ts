import { createHmac, timingSafeEqual } from "node:crypto";
import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type {
  PaymentInitialization,
  PaymentInitializationMetadata,
  PaymentProvider,
  PaymentVerification,
} from "@/modules/payment/payment";
import { ProviderOperationError } from "@/kernel/provider-error";

export interface NowPaymentsConfiguration {
  apiKey: string;
  ipnSecret?: string;
  apiBaseUrl: string;
  ipnCallbackUrl?: string;
  payCurrency: string;
  payCurrencies?: readonly string[];
  asset?: string;
  network?: string;
  /** NOWPayments' documented sandbox create-payment test case. */
  sandboxCase?: NowPaymentsSandboxCase;
  displayName?: string;
  imageUrl?: string;
  description?: string;
}

/** Values documented by NOWPayments for its sandbox payment test procedure. */
export const NOWPAYMENTS_SANDBOX_CASES = ["success"] as const;
export type NowPaymentsSandboxCase = (typeof NOWPAYMENTS_SANDBOX_CASES)[number];

export type NowPaymentsHttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface PaymentData {
  payment_id: number | string;
  payment_status: string;
  pay_address?: string | null;
  pay_amount?: number | string | null;
  pay_currency?: string | null;
  price_amount?: number | string | null;
  price_currency?: string | null;
  order_id?: string | null;
  expiration_estimate_date?: string | null;
  asset?: string | null;
  network?: string | null;
}

interface MinimumAmountData {
  min_amount?: number | string | null;
  fiat_equivalent?: number | string | null;
}

export class NowPaymentsProvider implements PaymentProvider {
  readonly collectionCurrencies = ["USD"] as const;
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  readonly paymentCurrencies;
  readonly defaultPaymentCurrency: string;
  readonly name: string;

  constructor(
    private readonly config: NowPaymentsConfiguration,
    name = "nowpayments",
    private readonly http: NowPaymentsHttpClient = fetch,
  ) {
    this.name = name;
    this.displayName = config.displayName ?? "NOWPayments";
    this.imageUrl = config.imageUrl ?? "/images/payment/nowpayments.svg";
    this.description = config.description ?? "Pay through NOWPayments.";
    this.defaultPaymentCurrency = config.payCurrency.toLowerCase();
    const configuredCurrencies = config.payCurrencies ?? [config.payCurrency];
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
    const query = new URLSearchParams({
      currency_from: currencyFrom,
      currency_to: currencyTo,
      fiat_equivalent: currencyFrom,
    });
    const data = await this.request<MinimumAmountData>(
      `/v1/min-amount?${query.toString()}`,
      { method: "GET" },
      "transaction.minimum_amount",
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
    const priceAmountMarker = "__cliqero_price_amount__";
    const requestBody = {
      price_amount: priceAmountMarker,
      price_currency: input.amount.currency.toLowerCase(),
      pay_currency: payCurrency,
      order_id: reference,
      order_description: `Cliqero wallet funding ${reference}`,
      ...(this.config.ipnCallbackUrl ? { ipn_callback_url: this.config.ipnCallbackUrl } : {}),
      ...(isNowPaymentsSandboxApi(this.config.apiBaseUrl) && this.config.sandboxCase
        ? { case: this.config.sandboxCase }
        : {}),
    };
    const data = await this.request<PaymentData>(
      "/v1/payment",
      {
        method: "POST",
        body: JSON.stringify(requestBody).replace(JSON.stringify(priceAmountMarker), priceAmount),
      },
      "transaction.initialize",
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
    return { reference, metadata };
  }

  async verify(input: {
    reference: string;
    expectedAmount: Money;
    initialization?: PaymentInitializationMetadata;
  }): Promise<PaymentVerification> {
    const providerPaymentId = input.initialization?.providerPaymentId;
    if (!providerPaymentId) throw new Error("NOWPayments payment identifier is missing");
    const data = await this.request<PaymentData>(
      `/v1/payment/${encodeURIComponent(providerPaymentId)}`,
      {
        method: "GET",
      },
      "transaction.verify",
    );
    if (data.order_id !== input.reference) throw new Error("NOWPayments order reference mismatch");
    const expectedPaymentCurrency = (
      input.initialization?.paymentCurrency ?? this.defaultPaymentCurrency
    ).toLowerCase();
    if (String(data.pay_currency ?? "").toLowerCase() !== expectedPaymentCurrency)
      throw new Error("NOWPayments payment currency mismatch");
    const currency = String(data.price_currency ?? input.expectedAmount.currency).toUpperCase();
    const price = decimalToMinor(data.price_amount);
    if (price === null) throw new Error("NOWPayments returned an invalid amount");
    const status = String(data.payment_status ?? "").toLowerCase();
    const terminalSuccess = status === "finished";
    return {
      verified: terminalSuccess,
      // FundingVerificationProcessor consumes the provider-neutral terminal status.
      status: terminalSuccess ? "success" : status,
      reference: input.reference,
      amount: Money.of(price, currency),
      providerTransactionId: String(data.payment_id),
    };
  }

  private resolvePaymentCurrency(requested?: string) {
    const value = (requested ?? this.defaultPaymentCurrency).trim().toLowerCase();
    if (!this.paymentCurrencies.some((currency) => currency.code === value))
      throw new Error(`NOWPayments payment currency is unsupported: ${requested ?? value}`);
    return value;
  }

  verifyIpnSignature(rawBody: Uint8Array, signature: string | null): boolean {
    if (!this.config.ipnSecret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(rawBody).toString("utf8"));
    } catch {
      return false;
    }
    const expected = createHmac("sha512", this.config.ipnSecret).update(sortJson(parsed)).digest();
    const presented = Buffer.from(signature, "hex");
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  private async request<T>(path: string, init: RequestInit, operation: string): Promise<T> {
    let response: Response;
    try {
      response = await this.http(new URL(path, this.config.apiBaseUrl), {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          "x-api-key": this.config.apiKey,
          "content-type": "application/json",
        },
      });
    } catch {
      throw new ProviderOperationError(
        this.name,
        operation,
        undefined,
        undefined,
        "Provider transport failure",
        undefined,
        "ambiguous",
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ProviderOperationError(
        this.name,
        operation,
        response.status,
        undefined,
        "Invalid provider response",
      );
    }
    if (!response.ok || !body || typeof body !== "object") {
      const diagnostic = providerErrorDiagnostic(body);
      throw new ProviderOperationError(
        this.name,
        operation,
        response.status,
        diagnostic.providerStatus,
        diagnostic.providerMessage,
        diagnostic.providerCode,
      );
    }
    return body as T;
  }
}

function providerErrorDiagnostic(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { providerMessage: "Provider rejected request" };
  const value = body as Record<string, unknown>;
  const nested =
    value.error && typeof value.error === "object" && !Array.isArray(value.error)
      ? (value.error as Record<string, unknown>)
      : {};
  const message = firstString(
    value.message,
    value.error_message,
    value.detail,
    nested.message,
    nested.error_message,
    nested.detail,
  );
  const code = firstString(
    value.code,
    value.error_code,
    value.errorCode,
    nested.code,
    nested.error_code,
    nested.errorCode,
  );
  return {
    providerStatus:
      typeof value.status === "boolean"
        ? value.status
        : typeof nested.status === "boolean"
          ? nested.status
          : undefined,
    providerMessage: sanitizeDiagnostic(message ?? "Provider rejected request"),
    providerCode: code ? sanitizeDiagnostic(code) : undefined,
  };
}

function firstString(...values: unknown[]) {
  return values
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()))
    ?.trim();
}

function sanitizeDiagnostic(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000);
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

function sortJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${sortJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
