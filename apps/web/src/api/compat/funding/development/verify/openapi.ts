import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { text, uuid, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "POST /api/funding/development/verify": {
    responseSchema: object({ funding_id: uuid, state: text }),
    requestBody: jsonBody(object({ funding_id: uuid })),
  },
});
