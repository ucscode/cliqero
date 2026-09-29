import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const paymentsOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/payments",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/payments/{paymentId}",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/payments/events",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/payments/reconcile",
    method: "get",
    mode: "account",
    capability: "finance.manage",
    scope: "payments:manage",
  },
  {
    path: "/api/payments/{paymentId}/reconcile",
    method: "post",
    mode: "account",
    capability: "finance.manage",
    scope: "payments:manage",
  },
];
