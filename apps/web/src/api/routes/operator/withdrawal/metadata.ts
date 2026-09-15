import type { OpenApiMetadataEntry } from "../../../openapi/metadata";

export const operatorWithdrawalOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  ...[
    "",
    "/{withdrawalId}",
    "/{withdrawalId}/approve",
    "/{withdrawalId}/reject",
    "/{withdrawalId}/payout",
    "/{withdrawalId}/payout/reconcile",
    "/{withdrawalId}/complete",
  ].map((suffix) => ({
    path: `/api/operator/withdrawals${suffix}`,
    method:
      suffix.endsWith("/approve") ||
      suffix.endsWith("/reject") ||
      suffix.endsWith("/payout") ||
      suffix.endsWith("/reconcile") ||
      suffix.endsWith("/complete")
        ? "post"
        : "get",
    mode: "account",
    scope: "withdrawals:manage",
  })),
];
