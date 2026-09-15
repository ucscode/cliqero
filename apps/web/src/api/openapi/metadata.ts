type OpenApiOperation = Record<string, unknown>;
export type OpenApiDocument = { paths: Record<string, Record<string, OpenApiOperation>> };
export type LegacyRoute = {
  path: string;
  methods: readonly { method: string; access: { mode: string; scope?: string } }[];
};
export type OpenApiMetadataEntry = {
  path: string;
  method: string;
  mode: string;
  scope?: string;
};

const response = {
  description: "Application API response",
  content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
};
const errorResponse = {
  description: "Request error",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" }, code: { type: "string" } },
        required: ["error"],
      },
    },
  },
};

function setAccess(operation: OpenApiOperation, mode: string, scope?: string) {
  operation["x-authentication-mode"] = mode;
  if (scope) operation["x-required-api-scope"] = scope;
}

/** Adds compatibility and capability metadata without capability policy in the API composition root. */
export function applyOpenApiMetadata(
  document: OpenApiDocument,
  legacyRoutes: readonly LegacyRoute[],
  contributions: readonly (readonly OpenApiMetadataEntry[])[],
) {
  for (const route of legacyRoutes) {
    const path = (document.paths[route.path] ??= {});
    for (const routeMethod of route.methods) {
      const method = routeMethod.method.toLowerCase();
      path[method] ??= {
        "x-authentication-mode": routeMethod.access.mode,
        ...(routeMethod.access.scope ? { "x-required-api-scope": routeMethod.access.scope } : {}),
        responses: {
          "200": response,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      };
    }
  }

  for (const contribution of contributions)
    for (const entry of contribution) {
      const operation = document.paths[entry.path]?.[entry.method.toLowerCase()];
      if (operation) setAccess(operation, entry.mode, entry.scope);
    }
}
