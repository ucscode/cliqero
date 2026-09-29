import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const financeOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/distributions",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/distributions/{distributionId}",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/earnings/entries",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
];
