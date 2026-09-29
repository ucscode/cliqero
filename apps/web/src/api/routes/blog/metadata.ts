import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const blogOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/blog/posts",
    method: "get",
    mode: "anonymous",
    capability: "content.manage",
    scope: "blog:read",
  },
  {
    path: "/api/blog/posts",
    method: "post",
    mode: "account",
    capability: "content.manage",
    scope: "blog:write",
  },
  { path: "/api/blog/posts/{postId}", method: "get", mode: "anonymous" },
  {
    path: "/api/blog/posts/{postId}",
    method: "patch",
    mode: "account",
    capability: "content.manage",
    scope: "blog:write",
  },
  {
    path: "/api/blog/posts/{postId}",
    method: "delete",
    mode: "account",
    capability: "content.manage",
    scope: "blog:manage",
  },
  {
    path: "/api/blog/previews",
    method: "post",
    mode: "session_only",
    capability: "content.manage",
    apiKey: "reject",
  },
  {
    path: "/api/blog/previews/{previewId}",
    method: "delete",
    mode: "session_only",
    capability: "content.manage",
    apiKey: "reject",
  },
  { path: "/api/blog/categories", method: "get", mode: "anonymous" },
  {
    path: "/api/blog/categories",
    method: "post",
    mode: "account",
    capability: "content.manage",
    scope: "blog:write",
  },
  {
    path: "/api/blog/categories/{categoryId}",
    method: "patch",
    mode: "account",
    capability: "content.manage",
    scope: "blog:write",
  },
  {
    path: "/api/blog/categories/{categoryId}",
    method: "delete",
    mode: "account",
    capability: "content.manage",
    scope: "blog:manage",
  },
];
