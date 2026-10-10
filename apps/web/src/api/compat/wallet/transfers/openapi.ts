import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, text, object, zodSchema } from "@/api/openapi/schema";
import { walletTransferResultSchema } from "@/api/compat/wallet/transfers/contracts";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/wallet/transfers": {
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
  "POST /api/wallet/transfers": {
    responseSchema: zodSchema(walletTransferResultSchema),
    successStatus: "201",
    requestBody: jsonBody(
      object({
        from: scalar("string", { enum: ["funding", "earnings"] }),
        to: scalar("string", { enum: ["funding", "earnings"] }),
        amount_minor: scalar("string", { pattern: "^[1-9]\\d*$" }),
        transaction_pin: scalar("string", { pattern: "^[0-9]{6}$" }),
      }),
    ),
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "POST /api/wallet/transfers response 201": {
    id: "9fa85f64-5717-4562-b3fc-2c963f66afa6",
    from: "funding",
    to: "earnings",
    grossMinor: "3100",
    feeMinor: "0",
    netMinor: "3100",
  },
};
