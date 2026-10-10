import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const withdrawalOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/withdrawals/policy", method: "get", mode: "account", scope: "withdrawals:read" },
  {
    path: "/api/withdrawals",
    method: "get",
    mode: "account",
    scope: "withdrawals:read",
  },
  {
    path: "/api/withdrawals/{withdrawalId}",
    method: "get",
    mode: "account",
    scope: "withdrawals:read",
  },
  {
    path: "/api/withdrawals/{withdrawalId}",
    method: "patch",
    mode: "account",
    scopeAnyOf: ["withdrawals:create", "withdrawals:manage"],
    authorizationVariants: [
      { discriminator: "status", value: "cancelled", scope: "withdrawals:create" },
      {
        discriminator: "status",
        value: "cancelled",
        scope: "withdrawals:manage",
        capability: "withdrawals.manage",
      },
      {
        discriminator: "status",
        value: "approved",
        scope: "withdrawals:manage",
        capability: "withdrawals.manage",
      },
      {
        discriminator: "status",
        value: "rejected",
        scope: "withdrawals:manage",
        capability: "withdrawals.manage",
      },
    ],
  },
  {
    path: "/api/withdrawals/{withdrawalId}/complete",
    method: "post",
    mode: "account",
    capability: "withdrawals.manage",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/withdrawals/{withdrawalId}/payout-initiation",
    method: "post",
    mode: "account",
    capability: "withdrawals.manage",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/withdrawals/{withdrawalId}/payout-failure",
    method: "post",
    mode: "account",
    capability: "withdrawals.manage",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/withdrawals/{withdrawalId}/payout-return",
    method: "post",
    mode: "account",
    capability: "withdrawals.manage",
    scope: "withdrawals:manage",
  },
];
