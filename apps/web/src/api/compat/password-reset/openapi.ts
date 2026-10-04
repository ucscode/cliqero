import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, text, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "POST /api/password-reset/request": {
    responseSchema: object({
      status: scalar("boolean", { enum: [true] }),
      message: text,
    }),
    requestBody: jsonBody(
      object(
        {
          email: scalar("string", { format: "email" }),
          redirectTo: scalar("string", { format: "uri" }),
          captchaToken: text,
        },
        ["email", "redirectTo"],
      ),
    ),
  },
  "POST /api/password-reset": {
    responseSchema: object({ status: scalar("boolean", { enum: [true] }) }),
    requestBody: jsonBody(object({ token: text, newPassword: text })),
  },
});
