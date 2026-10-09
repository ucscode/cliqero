import { defineCompatibilityContracts } from "@/api/openapi/compatibility";
import { scalar, text, object } from "@/api/openapi/schema";

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/health": {
    responseDescription: "Application and PostgreSQL health.",
    response: {
      "200": {
        description: "Application and PostgreSQL are healthy.",
        content: {
          "application/json": {
            schema: object({
              status: scalar("string", { enum: ["ok"] }),
              service: text,
              dependencies: object({ database: scalar("string", { enum: ["ok"] }) }),
            }),
          },
        },
      },
      "503": {
        description: "The application or its PostgreSQL dependency is unavailable.",
        content: {
          "application/json": {
            schema: object({
              status: scalar("string", { enum: ["unavailable"] }),
              service: text,
              dependencies: object({ database: scalar("string", { enum: ["unavailable"] }) }),
              error: text,
              code: scalar("string", { enum: ["service_unavailable"] }),
            }),
            example: {
              status: "unavailable",
              service: "cliqero-main",
              dependencies: { database: "unavailable" },
              error: "Service unavailable",
              code: "service_unavailable",
            },
          },
        },
      },
    },
  },
});
