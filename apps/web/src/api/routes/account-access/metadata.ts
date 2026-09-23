import type { OpenApiMetadataEntry } from "../../openapi/metadata";

export const accountAccessOpenApiMetadata: readonly OpenApiMetadataEntry[] = [
  { path: "/api/me/session", method: "get", mode: "session" },
  { path: "/api/me/access", method: "get", mode: "account" },
];
