import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const blogOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/blog/posts", method: "get", mode: "public" },
  { path: "/api/blog/posts", method: "post", mode: "account", scope: "blog:write" },
  { path: "/api/blog/posts/{slug}", method: "get", mode: "public" },
  { path: "/api/blog/posts/{id}", method: "patch", mode: "account", scope: "blog:write" },
  { path: "/api/blog/posts/{id}", method: "delete", mode: "account", scope: "blog:manage" },
  { path: "/api/blog/posts/{id}/publish", method: "post", mode: "account", scope: "blog:publish" },
  {
    path: "/api/blog/posts/{id}/unpublish",
    method: "post",
    mode: "account",
    scope: "blog:publish",
  },
  { path: "/api/operator/blog", method: "get", mode: "account", scope: "blog:read" },
];
