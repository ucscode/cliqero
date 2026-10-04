import { defineCompatibilityContracts } from "@/api/openapi/compatibility";
import { scalar, list, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/distribution-policy": {
    responseSchema: object({
      platform_percentage: scalar("number"),
      levels: list(object({ level: scalar("integer"), percentage: scalar("number") })),
      allocated_percentage: scalar("number"),
      maximum_payable_level: scalar("integer"),
      nominal_platform_remainder_percentage: scalar("number"),
    }),
  },
});
