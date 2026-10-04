import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, uuid, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "POST /api/access/verify": {
    responseSchema: {
      oneOf: [
        object({
          authorized: scalar("boolean", { enum: [true] }),
          entitlement_id: uuid,
          listing_id: uuid,
          buyer_id: uuid,
        }),
        object({ authorized: scalar("boolean", { enum: [false] }) }),
      ],
    },
    requestBody: jsonBody(object({ source: scalar("string", { minLength: 1, maxLength: 512 }) })),
  },
});
