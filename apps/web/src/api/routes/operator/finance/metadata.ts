import type { OpenApiMetadataEntry } from "../../../openapi/metadata";

export const operatorFinanceOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/operator/distributions",
    method: "get",
    mode: "account",
    scope: "operations:manage",
  },
  {
    path: "/api/operator/distributions/{distributionId}",
    method: "get",
    mode: "account",
    scope: "operations:manage",
  },
  { path: "/api/operator/earnings", method: "get", mode: "account", scope: "operations:manage" },
];
