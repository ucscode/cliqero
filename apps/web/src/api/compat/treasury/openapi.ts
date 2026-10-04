import { defineCompatibilityContracts } from "@/api/openapi/compatibility";
import { text, uuid, dateTime, nullable, list, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/treasury": {
    responseSchema: object({
      balance_minor: text,
      credits_minor: text,
      debits_minor: text,
      currency: text,
    }),
  },
  "GET /api/treasury/entries": {
    responseSchema: object({
      items: list(
        object({
          id: uuid,
          direction: text,
          amount_minor: text,
          title: text,
          note: nullable(text),
          source_kind: nullable(text),
          source_id: nullable(uuid),
          actor_id: nullable(uuid),
          created_at: dateTime,
        }),
      ),
      next_cursor: nullable(text),
    }),
  },
  "GET /api/treasury/entries/{entryId}": {
    responseSchema: object({
      id: uuid,
      direction: text,
      amount_minor: text,
      title: text,
      note: nullable(text),
      source_kind: nullable(text),
      source_id: nullable(uuid),
      created_at: dateTime,
    }),
  },
  "POST /api/treasury/entries": {
    successStatus: "410",
  },
  "POST /api/treasury/expenses": {
    successStatus: "410",
  },
});
