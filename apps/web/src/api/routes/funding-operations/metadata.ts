import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const fundingOperationsOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/funding",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/funding/{fundingId}",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/funding/{fundingId}/reconcile-credit",
    method: "post",
    mode: "account",
    capability: "finance.manage",
    scope: "payments:manage",
  },
];
