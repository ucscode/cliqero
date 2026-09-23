import type { OpenApiMetadataEntry } from "../../../openapi/metadata";

export const operatorWithdrawalOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/operator/withdrawals",
    method: "get",
    mode: "account",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/operator/withdrawals/{withdrawalId}",
    method: "get",
    mode: "account",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/operator/withdrawals/{withdrawalId}",
    method: "patch",
    mode: "account",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/operator/withdrawals/{withdrawalId}/payout",
    method: "post",
    mode: "account",
    scope: "withdrawals:manage",
  },
  {
    path: "/api/operator/withdrawals/{withdrawalId}/payout/reconcile",
    method: "post",
    mode: "account",
    scope: "withdrawals:manage",
  },
];
