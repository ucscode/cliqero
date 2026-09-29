export const catalogueOpenApiMetadata = [
  { path: "/api/catalogue/categories", method: "get", mode: "anonymous" as const },
  ...["get", "post"]
    .map((method) => ({
      path: "/api/catalogue/categories",
      method,
      mode: "account" as const,
      capability: "catalogue.manage",
      scope: "catalogue:manage",
    }))
    .filter((item) => item.method !== "get"),
  ...["get", "patch", "delete"].map((method) => ({
    path: "/api/catalogue/categories/{categoryId}",
    method,
    mode: "account" as const,
    scope: "catalogue:manage",
  })),
] as const;
