import { defineCompatibilityContracts } from "@/api/openapi/compatibility";
import { scalar, text, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/health": {
    responseSchema: object({ status: scalar("string", { enum: ["ok"] }), service: text }),
  },
});
