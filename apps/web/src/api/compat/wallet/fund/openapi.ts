import { defineCompatibilityContracts, jsonBody, multipartBody } from "@/api/openapi/compatibility";
import {
  scalar,
  text,
  uuid,
  dateTime,
  nullable,
  list,
  object,
  zodSchema,
} from "@/api/openapi/schema";
import {
  fundingDetailSchema,
  fundingStatusSchema,
  fundingStateSchema,
} from "@/api/compat/wallet/fund/contracts";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/funding-transactions": {
    responseSchema: object({
      items: list(zodSchema(fundingStatusSchema)),
      next_cursor: nullable(text),
    }),
    parameters: [
      {
        name: "state",
        schema: zodSchema(fundingStateSchema),
      },
      { name: "cursor", schema: scalar("string") },
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 50, default: 20 }) },
      { name: "active", schema: scalar("boolean") },
    ],
  },
  "GET /api/funding-transactions/{fundingId}": {
    responseSchema: zodSchema(fundingDetailSchema),
  },
  "POST /api/funding-transactions": {
    responseSchema: object({
      id: uuid,
      state: text,
      amount_minor: text,
      currency: text,
      provider: text,
    }),
    successStatus: "201",
    requestBody: jsonBody(
      object(
        {
          amount_minor: scalar("string", { pattern: "^[1-9][0-9]*$" }),
          provider: scalar("string", { minLength: 1 }),
          payment_currency: scalar("string", { minLength: 1 }),
          bank_account_id: scalar("string", { minLength: 1 }),
        },
        ["amount_minor", "provider"],
      ),
    ),
  },
  "POST /api/funding-transactions/{fundingId}/cancel": {
    responseSchema: object({ id: uuid, state: text }),
  },
  "POST /api/funding-transactions/{fundingId}/initialize": {
    responseSchema: zodSchema(fundingDetailSchema),
  },
  "POST /api/funding-transactions/{fundingId}/verify": {
    responseSchema: object({
      id: uuid,
      state: text,
      provider_transaction_id: nullable(text),
      verification: nullable(
        object({ status: text, message: text, level: text, resolved: scalar("boolean") }),
      ),
    }),
  },
  "POST /api/bank-transfer/funding-transactions/{fundingId}/evidence": {
    responseSchema: object({
      id: uuid,
      funding_id: uuid,
      state: text,
      transfer_reference: nullable(text),
      customer_note: nullable(text),
      created_at: dateTime,
      proof: nullable(
        object({ original_filename: nullable(text), mime_type: text, byte_size: text }),
      ),
    }),
    successStatus: "201",
    requestBody: multipartBody({
      transfer_reference: scalar("string", { maxLength: 200 }),
      customer_note: scalar("string", { maxLength: 2000 }),
      proof_file: scalar("string", { format: "binary" }),
    }),
  },
  "POST /api/direct-trc20/funding-transactions/{fundingId}/transaction": {
    responseSchema: object({
      id: uuid,
      state: text,
      provider_transaction_id: nullable(text),
      verification: nullable(
        object({ status: text, message: text, level: text, resolved: scalar("boolean") }),
      ),
    }),
    successStatus: "202",
    requestBody: jsonBody(
      object({
        transaction_hash: scalar("string", { pattern: "^(0x)?[a-fA-F0-9]{64}$" }),
      }),
    ),
  },
});
