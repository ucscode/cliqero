import type { OpenApiMetadataEntry } from "@/api/openapi/metadata";

export const walletTransferCompensationOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/wallet-transfer-compensations",
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
    path: "/api/wallet-transfer-compensations",
    method: "post",
    mode: "account",
    scope: "payments:manage",
    capability: "finance.manage",
  },
  {
    path: "/api/wallet-transfer-compensations/{compensationId}",
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
];
