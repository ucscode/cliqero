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
  capability?: string;
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
  public: [],
  mixed: ["401", "403"],
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

function setAccess(
  operation: OpenApiOperation,
  access: { mode: string; scope?: string; capability?: string },
) {
  if (!accessMetadataBases.has(operation)) {
    accessMetadataBases.set(operation, {
      security: operation.security,
    });
  }
  const base = accessMetadataBases.get(operation)!;

  operation["x-authentication-mode"] = access.mode;
  if (access.mode === "anonymous" || access.mode === "mixed") operation["x-public-access"] = true;
  else delete operation["x-public-access"];
  if (access.capability) operation["x-session-capability"] = access.capability;
  else delete operation["x-session-capability"];
  if (access.scope) operation["x-required-api-scope"] = access.scope;
  else delete operation["x-required-api-scope"];

  if (access.mode !== "account" && !access.scope) {
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

const domainDescriptions: Record<string, string> = {
  Accounts:
    "Account operations use safe identity projections and enforce ownership or operator capability rules.",
  Listings:
    "Listing operations enforce seller ownership and the listing domain's supported lifecycle transitions.",
  Catalogue:
    "Catalogue operations manage listings and categories under the catalogue management capability.",
  Integrations:
    "Integration credentials are scoped to their owning listing; plaintext credentials are returned only when created or rotated.",
  Blog: "Blog operations validate article and category rules; publishing requires the appropriate content capability.",
  Reviews:
    "Review operations preserve reviewer ownership and accept only supported moderation transitions.",
  Payments:
    "Payment operations expose provider-neutral records and delegate verification to the recorded provider workflow.",
  Purchases:
    "Purchase and checkout operations preserve payment, ownership, and purchase lifecycle rules.",
  Wallet:
    "Wallet operations preserve funding verification, ledger idempotency, and account ownership boundaries.",
  Funding:
    "Funding records are persisted before provider initialization and are processed idempotently.",
  Withdrawals:
    "Withdrawal operations enforce account ownership, reserved-balance, and supported management transitions.",
  Hierarchy:
    "Hierarchy operations return only relationships authorized for the authenticated account or hierarchy manager.",
  Referrals:
    "Referral operations use the live referral graph and preserve attribution and authorization rules.",
  Earnings:
    "Earnings and distribution operations are read from persisted accounting records; historical entries are immutable.",
  Treasury:
    "Treasury operations are capability-protected and preserve immutable accounting records.",
  Capabilities:
    "Capability operations require authorized account administration and do not expose credential secrets.",
  "Provider callbacks":
    "Provider ingress validates the provider protocol and records events before application processing.",
  "Core/System": "System operations expose health and shared API capabilities.",
  "Internal UI": "This operation supports authenticated Cliqero application interfaces.",
  Operations: "Overview data is limited by the caller's documented account capabilities.",
};

function domainForPath(path: string): string {
  if (path.startsWith("/api/webhooks/") || path.includes("/ipn")) return "Provider callbacks";
  const relative = path.replace(/^\/api\//, "");
  if (relative === "overview") return "Operations";
  if (
    relative.startsWith("accounts") ||
    relative.startsWith("api-keys") ||
    relative.startsWith("me/")
  )
    return "Accounts";
  if (relative.includes("integrations")) return "Integrations";
  if (relative.startsWith("catalogue")) return "Catalogue";
  if (relative.startsWith("listings")) return "Listings";
  if (relative.startsWith("blog")) return "Blog";
  if (relative.startsWith("reviews")) return "Reviews";
  if (relative.startsWith("payments") || relative.includes("payment-callback")) return "Payments";
  if (relative.startsWith("purchases") || relative.startsWith("checkout")) return "Purchases";
  if (relative.startsWith("funding")) return "Funding";
  if (relative.startsWith("wallet")) return "Wallet";
  if (relative.startsWith("withdrawal")) return "Withdrawals";
  if (relative.startsWith("hierarchy")) return "Hierarchy";
  if (relative.startsWith("referral")) return "Referrals";
  if (relative.startsWith("treasury")) return "Treasury";
  if (
    relative.startsWith("earning") ||
    relative.startsWith("distribution") ||
    relative.startsWith("settlement")
  )
    return "Earnings";
  if (relative.startsWith("capabilit")) return "Capabilities";
  if (relative.startsWith("access/")) return "Integrations";
  if (path === "/api/openapi.json") return "Internal UI";
  return "Core/System";
}

function readableResource(path: string) {
  const segments = path
    .replace(/^\/api\//, "")
    .split("/")
    .filter((segment) => segment && !/^\{.+\}$/.test(segment));
  const last = segments.at(-1) ?? "API operation";
  const singular = last.endsWith("ies")
    ? `${last.slice(0, -3)}y`
    : last.endsWith("s")
      ? last.slice(0, -1)
      : last;
  return singular.replaceAll("-", " ");
}

function operationSummary(path: string, method: string) {
  const resource = readableResource(path);
  if (path === "/api/health") return "Check API health";
  if (path === "/api/overview") return "Get overview";
  if (path === "/api/wallet") return "Get wallet summary";
  if (path === "/api/me/profile") return method === "get" ? "Get profile" : "Update profile";
  if (path === "/api/me/session") return "Get current session";
  if (path === "/api/access/verify") return "Verify purchase access";
  if (path.endsWith("/revoke")) return "Revoke API key";
  if (path.endsWith("/reverse")) return "Reverse a purchase";
  if (path.endsWith("/settlement")) return "Settle earnings";
  if (path.endsWith("/reconcile"))
    return method === "get" ? "List payment reconciliation candidates" : "Reconcile a payment";
  if (path.endsWith("/rotate")) return "Rotate integration credential";
  if (path.endsWith("/verify"))
    return path.includes("/fund") ? "Verify funding" : "Verify resource status";
  if (path.endsWith("/cancel")) return "Cancel funding";
  if (path.endsWith("/pay")) return "Pay for checkout";
  if (path.endsWith("/transaction")) return "Submit funding transaction";
  if (path.endsWith("/evidence")) return "Submit funding evidence";
  if (path.endsWith("/initialize")) return "Initialize funding";
  if (path.endsWith("/import")) return "Import listings";
  if (path.endsWith("/export")) return "Export listings";
  if (path.endsWith("/confirm-bank-transfer")) return "Confirm bank transfer funding";
  if (method === "get")
    return /^.*\/\{[^/]+\}$/.test(path) ? `Get ${resource}` : `List ${resource}`;
  if (method === "post") return `Create ${resource}`;
  if (method === "patch" || method === "put")
    return domainForPath(path).startsWith("Reviews") ? "Moderate a review" : `Update ${resource}`;
  if (method === "delete") return `Delete ${resource}`;
  return `Use ${resource}`;
}

function describeParameter(name: string) {
  const descriptions: Record<string, string> = {
    cursor: "Opaque cursor returned by the previous page; omit it to start at the first page.",
    limit: "Maximum number of records to return in this page.",
    state: "Requested lifecycle state; only domain-supported transitions are accepted.",
    status: "Requested status; only domain-supported transitions are accepted.",
    provider: "Provider identifier used to filter or route provider-neutral payment work.",
    listingId: "ID of the listing that owns this resource or integration.",
    integrationId: "ID of the integration associated with the listing in this URL.",
    accountId: "ID of the account being addressed.",
    reviewId: "ID of the review being moderated.",
    id: "ID of the resource being addressed.",
    search: "Optional text used to filter matching records.",
    visibility: "Listing visibility used to filter results or update the listing.",
  };
  return (
    descriptions[name] ??
    `The ${name.replaceAll(/([A-Z])/g, " $1").toLowerCase()} value for this operation.`
  );
}

function describeBodyField(name: string) {
  const descriptions: Record<string, string> = {
    state:
      "Requested lifecycle state. The domain validates whether the current state may transition to it.",
    status:
      "Requested status. Only the resource's supported status values and transitions are accepted.",
    visibility: "Controls who may discover or access the listing.",
    provider: "Identifies the payment provider that owns verification for this record.",
    name: "Human-readable name shown for this resource.",
    listingId: "ID of the listing that owns the integration.",
    listing_id: "ID of the listing that owns the integration.",
    cursor: "Opaque cursor returned by the previous page.",
    limit: "Maximum number of records to return.",
  };
  return descriptions[name];
}

function describeResponse(status: string, summary: string, path: string) {
  const resource = readableResource(path);
  const label = resource.charAt(0).toUpperCase() + resource.slice(1);
  if (status === "200") return `${summary} succeeded`;
  if (status === "201") return `${label} created successfully`;
  if (status === "204") return `${label} operation completed successfully`;
  if (status === "400" || status === "422") return `Invalid ${resource} request`;
  if (status === "401") return "Authentication required";
  if (status === "403") return "Insufficient permissions";
  if (status === "404") return `${label} not found`;
  if (status === "409") return `${label} conflicts with its current state or existing data`;
  return `Request failed while attempting to ${summary.toLowerCase()}`;
}

function enrichOperation(path: string, method: string, operation: OpenApiOperation) {
  const tag = domainForPath(path);
  operation.tags = [tag];
  const summary =
    typeof operation.summary === "string" && operation.summary.trim()
      ? operation.summary
      : operationSummary(path, method);
  operation.summary = summary;
  if (typeof operation.description !== "string" || !operation.description.trim()) {
    operation.description = `${summary}. ${domainDescriptions[tag] ?? domainDescriptions["Core/System"]}`;
  }

  if (method.toLowerCase() === "post" && /^\/api\/listings\/\{[^}]+\}\/integrations$/.test(path)) {
    operation.requestBody = {
      required: true,
      description: "Create a listing-scoped integration credential.",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Human-readable name for the integration credential.",
              },
            },
            required: ["name"],
            additionalProperties: false,
          },
        },
      },
    };
  }

  const parameters = Array.isArray(operation.parameters)
    ? (operation.parameters as Record<string, unknown>[])
    : [];
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (!parameters.some((parameter) => parameter.in === "path" && parameter.name === name))
      parameters.push({
        name,
        in: "path",
        required: true,
        description: describeParameter(name),
        schema: { type: "string" },
      });
  }
  if (parameters.length) operation.parameters = parameters;

  if (Array.isArray(operation.parameters))
    for (const parameter of operation.parameters) {
      if (parameter && typeof parameter === "object") {
        const item = parameter as Record<string, unknown>;
        if (typeof item.name === "string" && !item.description)
          item.description = describeParameter(item.name);
      }
    }

  const requestBody = operation.requestBody;
  if (requestBody && typeof requestBody === "object") {
    const content = (requestBody as Record<string, unknown>).content;
    if (content && typeof content === "object")
      for (const media of Object.values(content)) {
        if (!media || typeof media !== "object") continue;
        const schema = (media as Record<string, unknown>).schema;
        if (!schema || typeof schema !== "object") continue;
        const properties = (schema as Record<string, unknown>).properties;
        if (!properties || typeof properties !== "object") continue;
        for (const [name, field] of Object.entries(properties)) {
          if (!field || typeof field !== "object") continue;
          const description = describeBodyField(name);
          if (description && !(field as Record<string, unknown>).description)
            (field as Record<string, unknown>).description = description;
        }
      }
  }

  const responses = operation.responses;
  if (responses && typeof responses === "object") {
    for (const [status, response] of Object.entries(responses)) {
      if (!response || typeof response !== "object") continue;
      const item = response as Record<string, unknown>;
      if (item.description === "Application API response" || item.description === "Request error") {
        item.description = describeResponse(status, summary, path);
      }
    }
  }
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
      setAccess(operation, routeMethod.access);
      addAuthenticationResponses(operation, routeMethod.access);
    }
  }

  for (const contribution of contributions)
    for (const entry of contribution) {
      const operation = document.paths[entry.path]?.[entry.method.toLowerCase()];
      if (operation) {
        setAccess(operation, entry);
        addAuthenticationResponses(operation, entry);
      }
    }

  const tagNames = new Set<string>();
  for (const [path, pathItem] of Object.entries(document.paths))
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      enrichOperation(path, method, operation);
      tagNames.add(String((operation.tags as string[])[0]));
    }
  (document as Record<string, unknown>).tags = [...tagNames].sort().map((name) => ({
    name,
    description: domainDescriptions[name] ?? domainDescriptions["Core/System"],
  }));

  normalizeAuthorizationResponses(document);
}
