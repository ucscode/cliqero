import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, text, uuid, dateTime, nullable, list, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/purchases": {
    responseSchema: object({
      items: list(
        object({
          id: uuid,
          checkout_id: nullable(uuid),
          listing_id: uuid,
          title: text,
          short_description: text,
          long_description: text,
          amount_minor: text,
          currency: text,
          state: text,
          created_at: dateTime,
          entitlement_state: nullable(text),
          entitlement_expires_at: nullable(dateTime),
          access_available: scalar("boolean"),
        }),
      ),
      nextCursor: nullable(text),
    }),
  },
  "GET /api/purchases/{purchaseId}": {
    responseSchema: object({
      id: uuid,
      checkout_id: nullable(uuid),
      listing_id: uuid,
      title: text,
      short_description: text,
      long_description: text,
      amount_minor: text,
      currency: text,
      state: text,
      created_at: dateTime,
      entitlement_state: nullable(text),
      entitlement_expires_at: nullable(dateTime),
      access_available: scalar("boolean"),
    }),
  },
  "POST /api/purchases/reverse": {
    responseSchema: object({
      reversal: object({
        id: uuid,
        purchase_id: uuid,
        state: text,
        reason: text,
        amount_minor: text,
        currency: text,
        created_at: dateTime,
      }),
    }),
    requestBody: jsonBody(
      object({ purchase_id: uuid, reason: scalar("string", { minLength: 3, maxLength: 500 }) }),
    ),
  },
});
