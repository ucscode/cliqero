import { createHmac, timingSafeEqual } from "node:crypto";
import { NowPaymentsApiError, NowPaymentsResponseError, NowPaymentsTransportError } from "./errors";
import type {
  CreatePaymentInput,
  MinimumAmountInput,
  MinimumAmountResult,
  NowPaymentsClientOptions,
  NowPaymentsIpnPayload,
  PaymentResult,
} from "./types";

export class NowPaymentsClient {
  private readonly http: NonNullable<NowPaymentsClientOptions["http"]>;
  private readonly baseUrl: string;

  constructor(private readonly options: NowPaymentsClientOptions) {
    this.http = options.http ?? fetch;
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
  }

  getMinimumAmount(input: MinimumAmountInput) {
    const query = new URLSearchParams({
      currency_from: input.currencyFrom,
      currency_to: input.currencyTo,
      ...(input.fiatEquivalent === undefined ? {} : { fiat_equivalent: input.fiatEquivalent }),
    });
    return this.request<MinimumAmountResult>(`/v1/min-amount?${query.toString()}`, {
      method: "GET",
    });
  }

  createPayment(input: CreatePaymentInput) {
    const priceAmountMarker = "__cliqero_price_amount__";
    const body = {
      price_amount: priceAmountMarker,
      price_currency: input.priceCurrency,
      pay_currency: input.payCurrency,
      order_id: input.orderId,
      order_description: input.orderDescription,
      ...(input.ipnCallbackUrl ? { ipn_callback_url: input.ipnCallbackUrl } : {}),
      ...(input.sandboxCase ? { case: input.sandboxCase } : {}),
    };
    return this.request<PaymentResult>("/v1/payment", {
      method: "POST",
      body: JSON.stringify(body).replace(JSON.stringify(priceAmountMarker), input.priceAmount),
    });
  }

  getPaymentStatus(paymentId: string) {
    return this.request<PaymentResult>(`/v1/payment/${encodeURIComponent(paymentId)}`, {
      method: "GET",
    });
  }

  verifyIpnSignature(rawBody: Uint8Array, signature: string | null, secret: string) {
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
    } catch {
      return false;
    }
    const expected = createHmac("sha512", secret).update(sortJson(payload)).digest();
    const presented = Buffer.from(signature, "hex");
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  parseIpnPayload(rawBody: Uint8Array): NowPaymentsIpnPayload | null {
    return parseIpnPayload(rawBody);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.http(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          "x-api-key": this.options.apiKey,
          "content-type": "application/json",
        },
      });
    } catch (error) {
      throw new NowPaymentsTransportError(
        error instanceof Error ? error.message : "Provider transport failure",
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new NowPaymentsResponseError(response.status);
    }
    if (!response.ok || !body || typeof body !== "object") {
      const value = isRecord(body) ? body : {};
      const nested = isRecord(value.error) ? value.error : {};
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
      throw new NowPaymentsApiError(message ?? "Provider rejected request", {
        status: response.status,
        providerStatus:
          typeof value.status === "boolean"
            ? value.status
            : typeof nested.status === "boolean"
              ? nested.status
              : undefined,
        providerCode: code,
      });
    }
    return body as T;
  }
}

export function parseIpnPayload(rawBody: Uint8Array): NowPaymentsIpnPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.order_id !== "string" || value.order_id.length === 0)
    return null;
  const paymentId =
    value.payment_id === undefined || value.payment_id === null
      ? null
      : typeof value.payment_id === "string" || typeof value.payment_id === "number"
        ? String(value.payment_id)
        : null;
  const paymentStatus =
    value.payment_status === undefined || value.payment_status === null
      ? null
      : typeof value.payment_status === "string" && value.payment_status.trim().length > 0
        ? value.payment_status
        : null;
  if (value.payment_id !== undefined && value.payment_id !== null && !paymentId) return null;
  if (value.payment_status !== undefined && value.payment_status !== null && !paymentStatus)
    return null;
  return { orderId: value.order_id, paymentId, paymentStatus };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  );
}

function sortJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${sortJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
