import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
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
import { listingPageSchema } from "@/api/compat/listings/contracts";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/me/earnings/entries": {
    responseSchema: object({
      items: list(
        object({
          id: uuid,
          purchase_id: nullable(uuid),
          entry_type: text,
          direction: text,
          amount_minor: text,
          currency: text,
          recipient_role: nullable(text),
          balance_state: text,
          source: text,
          reason: nullable(text),
          reference: nullable(text),
          created_at: dateTime,
        }),
      ),
      nextCursor: nullable(text),
    }),
  },
  "GET /api/me/listings": {
    responseSchema: zodSchema(listingPageSchema),
  },
  "GET /api/me/profile": {
    responseSchema: object({ id: uuid, email: text, username: text, country: nullable(text) }),
  },
  "PATCH /api/me/profile": {
    responseSchema: object({
      id: uuid,
      email: text,
      username: text,
      country: nullable(text),
    }),
    requestBody: jsonBody(
      object({ country: nullable(scalar("string", { pattern: "^[A-Z]{2}$" })) }, []),
    ),
  },
  "GET /api/me/onboarding": {
    responseSchema: object({ hasPassword: scalar("boolean") }),
  },
  "POST /api/me/onboarding": {
    responseSchema: object({
      id: uuid,
      email: text,
      username: text,
      country: text,
    }),
    successStatus: "201",
    requestBody: jsonBody(
      object({ username: text, country: text, password: text }, ["username", "country"]),
    ),
  },
  "GET /api/me/withdrawals/policy": {
    responseSchema: object({
      enabled: scalar("boolean"),
      currency: text,
      minimum_amount_minor: text,
      maximum_amount_minor: nullable(text),
      fee_enabled: scalar("boolean"),
      fee_basis_points: text,
      fee_maximum_amount_minor: nullable(text),
    }),
  },
});
