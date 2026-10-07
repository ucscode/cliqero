import { defineCompatibilityContracts, jsonBody, multipartBody } from "@/api/openapi/compatibility";
import { scalar, text, uuid, dateTime, nullable, object, zodSchema } from "@/api/openapi/schema";
import { fundingDetailSchema } from "@/api/compat/wallet/fund/contracts";

export const compatibilityContracts = defineCompatibilityContracts({
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
  "POST /api/funding-transactions/{fundingId}/evidence": {
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
  "POST /api/funding-transactions/{fundingId}/provider-transaction": {
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
