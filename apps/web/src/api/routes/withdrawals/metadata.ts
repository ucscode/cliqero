import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const withdrawalOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/withdrawals",
    method: "get",
    mode: "account",
    capability: "withdrawals.manage",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/withdrawals/{withdrawalId}",
    method: "get",
    mode: "account",
    capability: "withdrawals.manage",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/withdrawals/{withdrawalId}",
    method: "patch",
    mode: "account",
    capability: "withdrawals.manage",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/withdrawals/{withdrawalId}/cancel",
    method: "post",
    mode: "account",
    scope: "withdrawals:create",
  },
  {
    path: "/api/withdrawals/{withdrawalId}/complete",
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
