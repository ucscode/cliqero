export const operatorCatalogueOpenApiMetadata = [
  ...["get", "post"].map((method) => ({
    path: "/api/operator/catalogue/categories",
    method,
    mode: "account" as const,
    scope: "catalogue:manage",
  })),
  ...["get", "patch", "delete"].map((method) => ({
    path: "/api/operator/catalogue/categories/{id}",
    method,
    mode: "account" as const,
    scope: "catalogue:manage",
  })),
] as const;
