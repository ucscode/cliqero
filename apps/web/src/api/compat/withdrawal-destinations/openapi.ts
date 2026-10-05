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
import { withdrawalDestinationPatchSchema } from "@/api/compat/withdrawal-destinations/contracts";
import { resourceDeleteSchema } from "@/api/shared/resource-delete";

const withdrawalDestinationField = object(
  {
    name: text,
    label: text,
    value: text,
    displayValue: text,
    type: scalar("string", { enum: ["text", "select", "textarea", "fixed", "hidden"] }),
    copyable: scalar("boolean"),
  },
  ["name", "label", "value", "type", "copyable"],
);
const savedWithdrawalDestination = object({
  id: uuid,
  method: object({ id: text, display_name: text, available: scalar("boolean") }),
  name: text,
  fields: list(withdrawalDestinationField),
  status: scalar("string", { enum: ["active", "archived"] }),
  created_at: dateTime,
  updated_at: dateTime,
});

export const compatibilityContracts = defineCompatibilityContracts({
  "DELETE /api/withdrawal-destinations": {
    responseSchema: object({
      results: list(object({ id: uuid, deleted: scalar("boolean"), error: nullable(text) })),
    }),
    requestBody: jsonBody(zodSchema(resourceDeleteSchema())),
  },
  "GET /api/withdrawal-destinations": {
    responseSchema: list(savedWithdrawalDestination),
  },
  "GET /api/withdrawal-destinations/{destinationId}": {
    responseSchema: savedWithdrawalDestination,
  },
  "POST /api/withdrawal-destinations": {
    responseSchema: savedWithdrawalDestination,
    successStatus: "201",
    requestBody: jsonBody(
      object({
        method: scalar("string", { minLength: 1, maxLength: 80 }),
        name: scalar("string", { minLength: 1, maxLength: 100 }),
        values: scalar("object", { additionalProperties: text }),
      }),
    ),
  },
  "PATCH /api/withdrawal-destinations/{destinationId}": {
    responseSchema: savedWithdrawalDestination,
    requestBody: jsonBody(zodSchema(withdrawalDestinationPatchSchema)),
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "PATCH /api/withdrawal-destinations/{destinationId} request": { name: "Primary bank" },
};
