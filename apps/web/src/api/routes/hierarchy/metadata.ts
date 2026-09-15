import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const hierarchyOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/operator/overview", method: "get", mode: "account", scope: "operations:manage" },
  { path: "/api/hierarchy/tree", method: "get", mode: "account", scope: "hierarchy:read" },
  { path: "/api/hierarchy/search", method: "get", mode: "account", scope: "hierarchy:read" },
  {
    path: "/api/hierarchy/children/{parentId}",
    method: "get",
    mode: "account",
    scope: "hierarchy:read",
  },
];
