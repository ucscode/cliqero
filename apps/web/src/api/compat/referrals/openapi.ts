import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, text, uuid, dateTime, nullable, list, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/referrals/account-url": {
    responseSchema: object({ url: text }),
  },
  "GET /api/referrals/direct": {
    responseSchema: object({
      items: list(
        object({ id: uuid, username: text, display_name: nullable(text), joined_at: dateTime }),
      ),
      next_cursor: nullable(text),
    }),
    parameters: [
      { name: "after", schema: scalar("string") },
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 100, default: 25 }) },
    ],
  },
  "GET /api/referrals/downline": {
    responseSchema: object({
      items: list(
        object({
          id: uuid,
          username: text,
          display_name: nullable(text),
          level: scalar("integer"),
          upline: nullable(object({ id: uuid, username: text, display_name: nullable(text) })),
          direct_child_count: scalar("integer"),
        }),
      ),
      next_cursor: nullable(text),
    }),
    parameters: [
      { name: "depth", schema: scalar("integer", { minimum: 1 }), required: true },
      { name: "after", schema: scalar("string") },
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 100, default: 25 }) },
    ],
  },
  "POST /api/referrals/parent": {
    responseSchema: object({
      child_account_id: uuid,
      parent_account_id: uuid,
      previous_parent_account_id: nullable(uuid),
      changed: scalar("boolean"),
    }),
    successStatus: "204",
    requestBody: jsonBody(object({ parent_account_id: uuid })),
  },
  "GET /api/referrals/uplines": {
    responseSchema: object({
      uplines: list(
        object({
          id: uuid,
          username: text,
          display_name: nullable(text),
          level: scalar("integer"),
        }),
      ),
    }),
    parameters: [{ name: "max_depth", schema: scalar("integer", { minimum: 1, default: 10 }) }],
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "POST /api/referrals/parent request": {
    parent_account_id: "4fa85f64-5717-4562-b3fc-2c963f66afa6",
  },
};
