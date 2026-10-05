import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import {
  scalar,
  text,
  uuid,
  dateTime,
  list,
  object,
  nullable,
  zodSchema,
} from "@/api/openapi/schema";
import { resourceDeleteSchema } from "@/api/shared/resource-delete";

const integrationWriteSchema = object({ name: scalar("string", { minLength: 1, maxLength: 100 }) });

export const compatibilityContracts = defineCompatibilityContracts({
  "DELETE /api/listings/{listingId}/integrations": {
    requestBody: jsonBody(zodSchema(resourceDeleteSchema())),
    responseSchema: object({
      results: list(object({ id: uuid, deleted: scalar("boolean"), error: nullable(text) })),
    }),
  },
  "GET /api/listings/{listingId}/integrations": {
    responseSchema: object({
      items: list(
        object({
          id: uuid,
          name: text,
          listing_ids: list(uuid),
          created_at: dateTime,
          updated_at: dateTime,
          status: scalar("string", { enum: ["active", "revoked"] }),
        }),
      ),
    }),
  },
  "POST /api/listings/{listingId}/integrations": {
    responseSchema: object({ integration_id: uuid, credential: text }),
    successStatus: "201",
    requestBody: jsonBody(integrationWriteSchema),
  },
  "GET /api/listings/{listingId}/integrations/{integrationId}": {
    responseSchema: object({
      id: uuid,
      name: text,
      listing_ids: list(uuid),
      created_at: dateTime,
      updated_at: dateTime,
      status: scalar("string", { enum: ["active", "revoked"] }),
    }),
  },
  "PATCH /api/listings/{listingId}/integrations/{integrationId}": {
    responseSchema: object({
      id: uuid,
      name: text,
      listing_ids: list(uuid),
      created_at: dateTime,
      updated_at: dateTime,
      status: scalar("string", { enum: ["active", "revoked"] }),
    }),
    requestBody: jsonBody(integrationWriteSchema),
  },
  "POST /api/listings/{listingId}/integrations/{integrationId}/rotate": {
    responseSchema: object({
      integration_id: uuid,
      credential: text,
    }),
  },
});
