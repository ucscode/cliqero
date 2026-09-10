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
  asset?: string;
  network?: string;
  /** NOWPayments' documented sandbox create-payment test case. */
  sandboxCase?: NowPaymentsSandboxCase;
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
}

export class NowPaymentsProvider implements PaymentProvider {
  readonly collectionCurrencies = ["USD"] as const;
  readonly name: string;

  constructor(
    private readonly config: NowPaymentsConfiguration,
    name = "nowpayments",
    private readonly http: NowPaymentsHttpClient = fetch,
  ) {
    this.name = name;
  }

  referenceFor(input: { paymentId: Id; idempotencyKey: string }) {
    return `np-${input.paymentId}`;
  }

  async initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
  }): Promise<PaymentInitialization> {
    const reference = this.referenceFor(input);
    const requestBody = {
      price_amount: decimalAmount(input.amount),
      price_currency: input.amount.currency.toLowerCase(),
      pay_currency: this.config.payCurrency.toLowerCase(),
      order_id: reference,
      order_description: `Cliqero wallet funding ${reference}`,
      ...(this.config.ipnCallbackUrl ? { ipn_callback_url: this.config.ipnCallbackUrl } : {}),
      ...(isNowPaymentsSandboxApi(this.config.apiBaseUrl) && this.config.sandboxCase
        ? { case: this.config.sandboxCase }
        : {}),
    };
    const data = await this.request<PaymentData>("/v1/payment", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
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
      paymentCurrency: String(data.pay_currency ?? this.config.payCurrency).toUpperCase(),
      asset: this.config.asset,
      network: this.config.network,
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
    );
    if (data.order_id !== input.reference) throw new Error("NOWPayments order reference mismatch");
    if (String(data.pay_currency ?? "").toLowerCase() !== this.config.payCurrency.toLowerCase())
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

  private async request<T>(path: string, init: RequestInit): Promise<T> {
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
        path.includes("/payment/") ? "transaction.verify" : "transaction.initialize",
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
        path.includes("/payment/") ? "transaction.verify" : "transaction.initialize",
        response.status,
        undefined,
        "Invalid provider response",
      );
    }
    if (!response.ok || !body || typeof body !== "object")
      throw new ProviderOperationError(
        this.name,
        path.includes("/payment/") ? "transaction.verify" : "transaction.initialize",
        response.status,
        undefined,
        "Provider rejected request",
      );
    return body as T;
  }
}

export function isNowPaymentsSandboxApi(apiBaseUrl: string): boolean {
  try {
    return new URL(apiBaseUrl).hostname.toLowerCase() === "api-sandbox.nowpayments.io";
  } catch {
    return false;
  }
}

function decimalAmount(money: Money): number {
  return Number(money.minorAmount) / 100;
}

function decimalToMinor(value: unknown): bigint | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
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
