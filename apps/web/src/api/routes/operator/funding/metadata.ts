import type { OpenApiMetadataEntry } from "../../../openapi/metadata";

export const operatorFundingOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/operator/funding", method: "get", mode: "account", scope: "operations:manage" },
  {
    path: "/api/operator/funding/{fundingId}",
    method: "get",
    mode: "account",
    scope: "operations:manage",
  },
];
