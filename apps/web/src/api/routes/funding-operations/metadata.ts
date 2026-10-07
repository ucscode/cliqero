import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const fundingOperationsOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/funding-transactions",
    method: "get",
    mode: "account",
    scopeAnyOf: ["wallet:read", "payments:read"],
    authorizationVariants: [
      { discriminator: "principal", value: "owner", scope: "wallet:read" },
      {
        discriminator: "principal",
        value: "finance_operator",
        scope: "payments:read",
        capability: "finance.read",
      },
    ],
  },
  {
    path: "/api/funding-transactions",
    method: "post",
    mode: "account",
    scopeAnyOf: ["wallet:fund", "payments:manage"],
    authorizationVariants: [
      { discriminator: "origin", value: "provider", scope: "wallet:fund" },
      {
        discriminator: "origin",
        value: "administrative",
        scope: "payments:manage",
        capability: "finance.manage",
      },
    ],
  },
  {
    path: "/api/funding-transactions",
    method: "delete",
    mode: "account",
    scope: "payments:manage",
    authorizationVariants: [
      {
        discriminator: "stored_origin",
        value: "administrative",
        scope: "payments:manage",
        capability: "finance.manage",
      },
      {
        discriminator: "stored_origin",
        value: "provider",
        scope: "payments:manage",
        capability: "system.root",
      },
    ],
  },
  {
    path: "/api/funding-transactions/{fundingId}",
    method: "get",
    mode: "account",
    scopeAnyOf: ["wallet:read", "payments:read"],
    authorizationVariants: [
      { discriminator: "principal", value: "owner", scope: "wallet:read" },
      {
        discriminator: "principal",
        value: "finance_operator",
        scope: "payments:read",
        capability: "finance.read",
      },
    ],
  },
  {
    path: "/api/funding-transactions/{fundingId}",
    method: "patch",
    mode: "account",
    scope: "payments:manage",
    capability: "finance.manage",
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
  { path: "/api/funding-methods", method: "get", mode: "account", scope: "wallet:fund" },
];
