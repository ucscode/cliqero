import type { OpenApiMetadataEntry } from "../../../openapi/metadata";

export const operatorTreasuryOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/operator/treasury", method: "get", mode: "account", scope: "treasury:read" },
  {
    path: "/api/operator/treasury/entries",
    method: "get",
    mode: "account",
    scope: "treasury:read",
  },
  {
    path: "/api/operator/treasury/entries",
    method: "post",
    mode: "account",
    scope: "treasury:manage",
  },
  {
    path: "/api/operator/treasury/entries/{entryId}",
    method: "get",
    mode: "account",
    scope: "treasury:read",
  },
];
