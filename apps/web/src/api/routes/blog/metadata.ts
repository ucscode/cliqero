import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const blogOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/blog/posts", method: "get", mode: "public" },
  { path: "/api/blog/posts", method: "post", mode: "account", scope: "blog:write" },
  { path: "/api/blog/posts/{slug}", method: "get", mode: "public" },
  { path: "/api/blog/posts/{id}", method: "patch", mode: "account", scope: "blog:write" },
  { path: "/api/blog/posts/{id}", method: "delete", mode: "account", scope: "blog:manage" },
  { path: "/api/operator/blog", method: "get", mode: "account", scope: "blog:read" },
  {
    path: "/api/operator/blog/preview",
    method: "post",
    mode: "session_only",
    apiKey: "reject",
  },
  {
    path: "/api/operator/blog/preview/{previewId}",
    method: "delete",
    mode: "session_only",
    apiKey: "reject",
  },
  { path: "/api/operator/blog/bulk", method: "post", mode: "account", scope: "blog:manage" },
  { path: "/api/operator/blog/categories", method: "get", mode: "account", scope: "blog:read" },
  { path: "/api/operator/blog/categories", method: "post", mode: "account", scope: "blog:write" },
  {
    path: "/api/operator/blog/categories/{categoryId}",
    method: "patch",
    mode: "account",
    scope: "blog:write",
  },
  {
    path: "/api/operator/blog/categories/{categoryId}",
    method: "delete",
    mode: "account",
    scope: "blog:manage",
  },
];
