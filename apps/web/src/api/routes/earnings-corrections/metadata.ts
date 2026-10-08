import type { OpenApiMetadataEntry } from "@/api/openapi/metadata";

export const earningsCorrectionOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/earnings/corrections",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
  {
    path: "/api/earnings/corrections",
    method: "post",
    mode: "account",
    capability: "finance.manage",
    scope: "payments:manage",
  },
  {
    path: "/api/earnings/corrections/{correctionId}",
    method: "get",
    mode: "account",
    capability: "finance.read",
    scope: "payments:read",
  },
];
