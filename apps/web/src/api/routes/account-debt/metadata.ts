import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const accountDebtOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/accounts/{accountId}/debt",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/accounts/{accountId}/debt/write-offs",
    method: "post",
    mode: "account",
    capability: "system.root",
    scope: "payments:manage",
  },
];
