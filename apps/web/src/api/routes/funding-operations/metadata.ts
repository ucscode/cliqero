import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const fundingOperationsOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/funding-transactions",
    method: "get",
    mode: "account",
    scope: "wallet:read (owner) or payments:read (finance operator)",
  },
  { path: "/api/funding-transactions", method: "post", mode: "account", scope: "wallet:fund" },
  {
    path: "/api/funding-transactions/{fundingId}",
    method: "get",
    mode: "account",
    scope: "wallet:read (owner) or payments:read (finance operator)",
  },
  {
    path: "/api/funding-transactions/{fundingId}/cancel",
    method: "post",
    mode: "account",
    scope: "wallet:fund",
  },
  {
    path: "/api/funding-transactions/{fundingId}/evidence",
    method: "post",
    mode: "account",
    scope: "wallet:fund",
  },
  {
    path: "/api/funding-transactions/{fundingId}/provider-transaction",
    method: "post",
    mode: "account",
    scope: "wallet:fund",
  },
  {
    path: "/api/funding-transactions/{fundingId}/initialize",
    method: "post",
    mode: "account",
    scope: "wallet:fund",
  },
  {
    path: "/api/funding-transactions/{fundingId}/verify",
    method: "post",
    mode: "account",
    scope: "wallet:fund",
  },
  {
    path: "/api/funding-transactions/{fundingId}/reconcile-credit",
    method: "post",
    mode: "account",
    capability: "finance.manage",
    scope: "payments:manage",
  },
  { path: "/api/funding-options", method: "get", mode: "account", scope: "wallet:fund" },
];
