import type { OpenApiMetadataEntry } from "../../../openapi/metadata";

export const accountsOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/accounts",
    method: "get",
    mode: "account",
    capability: "accounts.read",
    scope: "accounts:read",
  },
  {
    path: "/api/accounts",
    method: "post",
    mode: "mixed",
    capability: "accounts.manage",
    scope: "accounts:manage",
  },
  {
    path: "/api/accounts/{accountId}",
    method: "get",
    mode: "account",
    capability: "accounts.read",
    scope: "accounts:read",
  },
  {
    path: "/api/accounts/{accountId}",
    method: "patch",
    mode: "account",
    capability: "accounts.manage",
    scope: "accounts:manage",
  },
  {
    path: "/api/accounts/{accountId}",
    method: "delete",
    mode: "account",
    capability: "accounts.manage",
    scope: "accounts:manage",
  },
];
