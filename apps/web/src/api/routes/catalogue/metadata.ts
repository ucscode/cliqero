import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const catalogueOpenApiMetadata = [
  { path: "/api/catalogue/categories", method: "get", mode: "anonymous" as const },
  ...["get", "post"]
    .map((method) => ({
      path: "/api/catalogue/categories",
      method,
      mode: "account" as const,
      capability: "catalogue.manage",
      scope: "catalogue:manage" as const,
    }))
    .filter((item) => item.method !== "get"),
  ...["get", "patch"].map((method) => ({
    path: "/api/catalogue/categories/{categoryId}",
    method,
    mode: "account" as const,
    scope: "catalogue:manage" as const,
  })),
  {
    path: "/api/catalogue/categories",
    method: "delete",
    mode: "account",
    capability: "catalogue.manage",
    scope: "catalogue:manage" as const,
  },
] as const satisfies readonly OpenApiMetadataEntry[];
