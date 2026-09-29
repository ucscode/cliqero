import type { OpenApiMetadataEntry } from "../../../openapi/metadata";

export const operatorPaymentsOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/operator/payments", method: "get", mode: "account", scope: "payments:read" },
  {
    path: "/api/operator/payments/{paymentId}",
    method: "get",
    mode: "account",
    scope: "payments:read",
  },
  { path: "/api/operator/payments/events", method: "get", mode: "account", scope: "payments:read" },
  {
    path: "/api/operator/payments/reconcile",
    method: "get",
    mode: "account",
    scope: "payments:manage",
  },
  {
    path: "/api/operator/payments/{paymentId}/reconcile",
    method: "post",
    mode: "account",
    scope: "payments:manage",
  },
];
