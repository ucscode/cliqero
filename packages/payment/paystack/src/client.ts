import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PaystackApiError, PaystackResponseError, PaystackTransportError } from "./errors";
import type {
  CreateTransferRecipientInput,
  InitializeTransactionInput,
  PaystackClientOptions,
  SubmitTransferInput,
} from "./types";

const envelopeSchema = z.object({
  status: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});
const initializeTransactionSchema = z.object({
  authorization_url: z.string().url(),
  access_code: z.string().min(1),
  reference: z.string().min(1),
});
const transactionSchema = z.object({
  id: z.number().int(),
  status: z.string().min(1),
  reference: z.string().min(1),
  amount: z.number(),
  currency: z.string().min(1),
  fees: z.number().nullable().optional(),
});
const transferRecipientSchema = z.object({
  recipient_code: z.string().min(1),
  active: z.boolean().optional(),
});
const transferSchema = z.object({
  reference: z.string().min(1),
  transfer_code: z.string().optional(),
  status: z.string().min(1),
  amount: z.number(),
  currency: z.string().min(1),
});

export class PaystackClient {
  private readonly http: NonNullable<PaystackClientOptions["http"]>;
  private readonly baseUrl: string;

  constructor(private readonly options: PaystackClientOptions) {
    this.http = options.http ?? fetch;
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
  }

  async initializeTransaction(input: InitializeTransactionInput) {
    const data = await this.request(
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
      initializeTransactionSchema,
    );
    return data;
  }

  verifyTransaction(reference: string) {
    return this.request(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      { method: "GET" },
      false,
      transactionSchema,
    );
  }

  createTransferRecipient(input: CreateTransferRecipientInput) {
    return this.request(
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
      transferRecipientSchema,
    );
  }

  submitTransfer(input: SubmitTransferInput) {
    return this.request(
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
      transferSchema,
    );
  }

  verifyTransfer(reference: string) {
    return this.request(
      `/transfer/verify/${encodeURIComponent(reference)}`,
      { method: "GET" },
      false,
      transferSchema,
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

  private async request<T>(
    path: string,
    init: RequestInit,
    unknownOutcome: boolean,
    dataSchema: z.ZodType<T>,
  ): Promise<T> {
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

    let envelope: z.infer<typeof envelopeSchema>;
    try {
      envelope = envelopeSchema.parse(await response.json());
    } catch {
      throw new PaystackResponseError(response.status);
    }
    if (!response.ok || !envelope.status || envelope.data === undefined) {
      throw new PaystackApiError(envelope.message || "Provider rejected request", {
        status: response.status,
        providerStatus: envelope.status,
      });
    }
    try {
      return dataSchema.parse(envelope.data);
    } catch {
      throw new PaystackResponseError(response.status);
    }
  }
}
