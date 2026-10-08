import type { OpenApiMetadataEntry } from "@/api/openapi/metadata";

export const fundingReversalOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/funding-reversals",
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
    path: "/api/funding-reversals",
    method: "post",
    mode: "account",
    scope: "payments:manage",
    capability: "finance.manage",
  },
  {
    path: "/api/funding-reversals/{reversalId}",
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
