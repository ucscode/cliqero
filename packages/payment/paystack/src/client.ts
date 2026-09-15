import { createHmac, timingSafeEqual } from "node:crypto";
import { PaystackApiError, PaystackResponseError, PaystackTransportError } from "./errors";
import type {
  CreateTransferRecipientInput,
  CreateTransferRecipientResult,
  InitializeTransactionInput,
  InitializeTransactionResult,
  PaystackClientOptions,
  SubmitTransferInput,
  TransactionResult,
  TransferResult,
} from "./types";

interface Envelope<T> {
  status: boolean;
  message: string;
  data: T;
}

export class PaystackClient {
  private readonly http: NonNullable<PaystackClientOptions["http"]>;
  private readonly baseUrl: string;

  constructor(private readonly options: PaystackClientOptions) {
    this.http = options.http ?? fetch;
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
  }

  async initializeTransaction(input: InitializeTransactionInput) {
    const data = await this.request<InitializeTransactionResult>(
      "/transaction/initialize",
      {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          amount: input.amountMinor,
          currency: input.currency,
          reference: input.reference,
          ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
        }),
      },
      true,
    );
    return data;
  }

  verifyTransaction(reference: string) {
    return this.request<TransactionResult>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      { method: "GET" },
      false,
    );
  }

  createTransferRecipient(input: CreateTransferRecipientInput) {
    return this.request<CreateTransferRecipientResult>(
      "/transferrecipient",
      {
        method: "POST",
        body: JSON.stringify({
          type: "nuban",
          name: input.name,
          account_number: input.accountNumber,
          bank_code: input.bankCode,
          currency: input.currency,
        }),
      },
      false,
    );
  }

  submitTransfer(input: SubmitTransferInput) {
    return this.request<TransferResult>(
      "/transfer",
      {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          amount: input.amountMinor,
          recipient: input.recipientCode,
          reference: input.reference,
          reason: input.reason,
          currency: input.currency,
        }),
      },
      true,
    );
  }

  verifyTransfer(reference: string) {
    return this.request<TransferResult>(
      `/transfer/verify/${encodeURIComponent(reference)}`,
      { method: "GET" },
      false,
    );
  }

  verifyWebhookSignature(
    rawBody: Uint8Array,
    signature: string | null,
    secret = this.options.secretKey,
  ) {
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
    const expected = createHmac("sha512", secret).update(rawBody).digest();
    const presented = Buffer.from(signature, "hex");
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  private async request<T>(path: string, init: RequestInit, unknownOutcome: boolean): Promise<T> {
    let response: Response;
    try {
      response = await this.http(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${this.options.secretKey}`,
          "content-type": "application/json",
        },
      });
    } catch (error) {
      throw new PaystackTransportError(
        error instanceof Error ? error.message : "Paystack request failed",
        unknownOutcome,
      );
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new PaystackResponseError(response.status);
    }
    if (!response.ok || !envelope.status || envelope.data === undefined) {
      throw new PaystackApiError(envelope.message || "Provider rejected request", {
        status: response.status,
        providerStatus: envelope.status,
      });
    }
    return envelope.data;
  }
}
