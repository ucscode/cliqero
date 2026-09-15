import type { OpenApiMetadataEntry } from "../../../openapi/metadata";

export const operatorAccountsOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/operator/accounts", method: "get", mode: "account", scope: "operations:manage" },
  {
    path: "/api/operator/accounts/{accountId}",
    method: "get",
    mode: "account",
    scope: "operations:manage",
  },
];
