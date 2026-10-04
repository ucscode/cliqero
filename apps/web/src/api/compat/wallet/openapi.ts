import { defineCompatibilityContracts } from "@/api/openapi/compatibility";
import { scalar, text, uuid, dateTime, nullable, list, object } from "@/api/openapi/schema";

const walletSummary = object({
  currency: text,
  available_minor: text,
  pending_minor: text,
  active_fundings: list(
    object({
      id: uuid,
      state: text,
      provider: text,
      provider_display_name: text,
      funding_reference: text,
      provider_transaction_id: nullable(text),
      amount_minor: text,
      currency: text,
      authorization_url: nullable(text),
      payment_address: nullable(text),
      payment_amount: nullable(text),
      payment_currency: nullable(text),
      network: nullable(text),
      instructions: nullable(text),
      expires_at: nullable(dateTime),
    }),
  ),
});

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/wallet": {
    responseSchema: walletSummary,
  },
  "GET /api/wallet/transactions": {
    responseSchema: object({
      transactions: list(
        object({
          id: uuid,
          type: text,
          source_id: uuid,
          direction: text,
          label: text,
          reference: nullable(text),
          state: text,
          amount_minor: text,
          currency: text,
          created_at: dateTime,
          provider_display_name: nullable(text),
          provider_reference: nullable(text),
        }),
      ),
      next_cursor: nullable(text),
    }),
    parameters: [
      { name: "cursor", schema: scalar("string") },
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 50 }) },
    ],
  },
  "GET /api/wallet/transfer-quote": {
    responseSchema: object({
      gross_amount_minor: text,
      fee_minor: text,
      net_amount_minor: text,
      currency: text,
    }),
    parameters: [
      { name: "from", schema: scalar("string", { enum: ["funding", "earnings"] }), required: true },
      {
        name: "amount_minor",
        schema: scalar("string", { pattern: "^[1-9][0-9]*$" }),
        required: true,
      },
    ],
  },
  "GET /api/wallet/funding/prepare": {
    responseSchema: object({
      provider: text,
      amount_minor: text,
      currency: text,
      collection_amount_minor: text,
      collection_currency: text,
      payment_currency: nullable(text),
      funding_options: list(
        object({
          id: text,
          collection_currency: text,
          fields: list(
            object({ name: text, label: text, value: text, copyable: scalar("boolean") }),
          ),
        }),
      ),
      conversion: nullable(
        object({ from_currency: text, to_currency: text, rate: text, observed_at: dateTime }),
      ),
    }),
    parameters: [
      {
        name: "amount_minor",
        schema: scalar("string", { pattern: "^[1-9][0-9]*$" }),
        required: true,
      },
      { name: "provider", schema: scalar("string", { minLength: 1 }), required: true },
      { name: "payment_currency", schema: scalar("string", { minLength: 1 }) },
      { name: "bank_account_id", schema: scalar("string", { minLength: 1 }) },
    ],
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "GET /api/wallet/fund/{fundingId} response 200": {
    id: "9fa85f64-5717-4562-b3fc-2c963f66afa6",
    state: "awaiting_payment",
    provider: "direct_trc20",
    provider_display_name: "USDT TRC20",
    customer_action: null,
    funding_reference: "usdt-example-reference",
    provider_transaction_id: null,
    amount_minor: "2500",
    currency: "USD",
    collection_amount_minor: "2500",
    collection_currency: "USD",
    conversion: null,
    provider_account_id: null,
    provider_account_snapshot: null,
    authorization_url: null,
    payment_address: "TExampleWalletAddress",
    payment_amount: "25.00",
    payment_currency: "USDT",
    asset: "USDT",
    network: "TRC20",
    instructions: "Send exactly 25.00 USDT on TRC20.",
    expires_at: null,
    error_code: null,
    error_message: null,
    verification: null,
    confirmed_at: null,
    wallet_credit_state: null,
    evidence: null,
  },
};
