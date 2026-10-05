import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const purchaseRecoveryOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/purchases/{purchaseId}/reconcile-entitlement",
    method: "post",
    mode: "account",
    capability: "finance.manage",
    scope: "payments:manage",
  },
];
