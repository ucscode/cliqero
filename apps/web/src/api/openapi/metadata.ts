type OpenApiOperation = Record<string, unknown>;
export type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    securitySchemes?: Record<string, Record<string, string>>;
    [key: string]: unknown;
  };
};
export type LegacyRoute = {
  path: string;
  methods: readonly {
    method: string;
    access: { mode: string; scope?: string; apiKey?: "allow" | "reject" };
  }[];
};
export type OpenApiMetadataEntry = {
  path: string;
  method: string;
  mode: string;
  scope?: string;
  apiKey?: "allow" | "reject";
};

const response = {
  description: "Application API response",
  content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
};
const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" }, code: { type: "string" } },
        required: ["error"],
      },
    },
  },
});

const authenticationResponsesByMode: Record<string, readonly string[]> = {
  anonymous: [],
  account: ["401", "403"],
  session_only: ["401", "403"],
  integration_credential: ["401"],
  deny: ["403"],
};
const authorizationResponseDescriptions: Record<string, string> = {
  "401": "Authentication required",
  "403": "Insufficient permissions",
};

type AccessMetadataBase = { security?: unknown };
const accessMetadataBases = new WeakMap<OpenApiOperation, AccessMetadataBase>();

function setAccess(operation: OpenApiOperation, mode: string, scope?: string) {
  if (!accessMetadataBases.has(operation)) {
    accessMetadataBases.set(operation, {
      security: operation.security,
    });
  }
  const base = accessMetadataBases.get(operation)!;

  operation["x-authentication-mode"] = mode;
  if (scope) operation["x-required-api-scope"] = scope;
  else delete operation["x-required-api-scope"];

  if (mode !== "account") {
    if (base.security === undefined) delete operation.security;
    else operation.security = base.security;
    return;
  }

  operation.security = [{ CliqeroApiKey: [] }];
}

function addAuthenticationResponses(
  operation: OpenApiOperation,
  access: { mode: string; apiKey?: "allow" | "reject" },
) {
  const responses = (operation.responses ??= {}) as Record<string, unknown>;
  const statuses =
    access.mode === "anonymous" && access.apiKey === "reject"
      ? ["403"]
      : (authenticationResponsesByMode[access.mode] ?? []);
  for (const status of statuses)
    responses[status] ??= errorResponse(authorizationResponseDescriptions[status]);
}

function normalizeAuthorizationResponses(document: OpenApiDocument) {
  const genericDescriptions = new Set([
    "Request error",
    "Unauthorized",
    "Forbidden",
    "Not authorized",
  ]);

  for (const path of Object.values(document.paths))
    for (const operation of Object.values(path)) {
      const responses = operation.responses;
      if (!responses || typeof responses !== "object") continue;

      for (const [status, description] of Object.entries(authorizationResponseDescriptions)) {
        const response = (responses as Record<string, unknown>)[status];
        if (!response || typeof response !== "object") continue;
        const responseObject = response as Record<string, unknown>;
        if (
          typeof responseObject.description !== "string" ||
          genericDescriptions.has(responseObject.description)
        )
          responseObject.description = description;
      }
    }
}

function defaultTag(path: string): string {
  if (path === "/api/openapi.json") return "Internal UI";
  if (path.startsWith("/api/webhooks/") || path.includes("/ipn")) return "Provider callbacks";
  if (
    path.startsWith("/api/me/") ||
    path.startsWith("/api/operator/overview") ||
    path.includes("/development/")
  )
    return "Internal UI";
  if (path.includes("capabilities")) return "Capabilities";
  if (path.includes("payments") || path.includes("payment-callback")) return "Payments";
  if (path.includes("account") || path.includes("api-keys")) return "Accounts";
  if (path.includes("listing") || path.includes("catalogue")) return "Catalogue";
  if (path.includes("blog")) return "Blog";
  if (path.includes("review")) return "Reviews";
  if (path.includes("purchase") || path.includes("checkout")) return "Purchases";
  if (path.includes("wallet") || path.includes("funding")) return "Wallet";
  if (path.includes("withdrawal")) return "Withdrawals";
  if (path.includes("hierarchy")) return "Hierarchy";
  if (path.includes("referral")) return "Referrals";
  if (path.includes("treasury")) return "Treasury";
  if (path.includes("earning") || path.includes("distribution") || path.includes("settlement"))
    return "Earnings";
  return "Core/System";
}

/** Adds compatibility and capability metadata without capability policy in the API composition root. */
export function applyOpenApiMetadata(
  document: OpenApiDocument,
  legacyRoutes: readonly LegacyRoute[],
  contributions: readonly (readonly OpenApiMetadataEntry[])[],
) {
  document.components ??= {};
  document.components.securitySchemes ??= {};
  document.components.securitySchemes.CliqeroApiKey = {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Cliqero API Key",
    description:
      "Use an existing Cliqero API key as Authorization: Bearer <key>. Operations may require different scopes; each required scope is exposed through x-required-api-scope.",
  };

  for (const route of legacyRoutes) {
    const path = (document.paths[route.path] ??= {});
    for (const routeMethod of route.methods) {
      const method = routeMethod.method.toLowerCase();
      const operation = (path[method] ??= {
        responses: {
          "200": response,
          "400": errorResponse("Request error"),
          "404": errorResponse("Request error"),
        },
      });
      setAccess(operation, routeMethod.access.mode, routeMethod.access.scope);
      addAuthenticationResponses(operation, routeMethod.access);
    }
  }

  for (const contribution of contributions)
    for (const entry of contribution) {
      const operation = document.paths[entry.path]?.[entry.method.toLowerCase()];
      if (operation) {
        setAccess(operation, entry.mode, entry.scope);
        addAuthenticationResponses(operation, entry);
      }
    }

  for (const [path, pathItem] of Object.entries(document.paths))
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      if (!Array.isArray(operation.tags) || operation.tags.length === 0)
        operation.tags = [defaultTag(path)];
    }

  if (!Array.isArray((document as Record<string, unknown>).tags)) {
    (document as Record<string, unknown>).tags = [
      "Accounts",
      "Catalogue",
      "Blog",
      "Reviews",
      "Payments",
      "Purchases",
      "Wallet",
      "Withdrawals",
      "Referrals",
      "Hierarchy",
      "Earnings",
      "Treasury",
      "Capabilities",
      "Provider callbacks",
      "Internal UI",
      "Core/System",
    ].map((name) => ({ name }));
  }

  normalizeAuthorizationResponses(document);
}
