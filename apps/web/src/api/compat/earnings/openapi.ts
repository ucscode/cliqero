import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, text, list, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/earnings": {
    responseSchema: object({
      balances: list(object({ currency: text, state: text, amount_minor: text })),
      withdrawal_currency: text,
      withdrawable_balances: list(object({ currency: text, amount_minor: text })),
    }),
  },
  "POST /api/earnings/settlement": {
    responseSchema: object({
      claimed: scalar("integer"),
      settled: scalar("integer"),
    }),
    requestBody: jsonBody(
      object({ batch_size: scalar("integer", { minimum: 1, maximum: 1000, default: 100 }) }),
      false,
    ),
  },
});
