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
  {
    path: "/api/operator/catalogue/bulk",
    method: "post",
    mode: "account",
    scope: "catalogue:manage",
  },
] as const;
