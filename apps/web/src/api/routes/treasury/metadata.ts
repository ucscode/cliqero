import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const treasuryOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  {
    path: "/api/treasury",
    method: "get",
    mode: "account",
    capability: "treasury.manage",
    scope: "treasury:read",
  },
  {
    path: "/api/treasury/entries",
    method: "get",
    mode: "account",
    capability: "treasury.manage",
    scope: "treasury:read",
  },
  {
    path: "/api/treasury/adjustments",
    method: "post",
    mode: "account",
    capability: "treasury.manage",
    scope: "treasury:manage",
  },
  {
    path: "/api/treasury/entries/{entryId}",
    method: "get",
    mode: "account",
    capability: "treasury.manage",
    scope: "treasury:read",
  },
  {
    path: "/api/treasury/entries/{entryId}",
    method: "delete",
    mode: "account",
    capability: "system.root",
    scope: "treasury:manage",
  },
];
