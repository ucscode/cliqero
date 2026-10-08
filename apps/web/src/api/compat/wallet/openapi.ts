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
          type: scalar("string", {
            enum: [
              "funding_credit",
              "purchase_debit",
              "funding_adjustment",
              "funding_transfer",
              "wallet_transfer_compensation",
              "funding_reversal",
            ],
          }),
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
});

export const compatibilityExamples: Record<string, unknown> = {};
