import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const financeOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/earnings/adjustments",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/earnings/adjustments",
    method: "post",
    mode: "account",
    capability: "finance.manage",
    scope: "payments:manage",
  },
  {
    path: "/api/earnings/adjustments/{adjustmentId}",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
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
