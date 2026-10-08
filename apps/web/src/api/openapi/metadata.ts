import {
  compatibilityContracts,
  compatibilityExamples,
} from "@/api/openapi/compatibility-contracts";
import { generatedZodComponents } from "@/api/openapi/schema";
import type { ApiScope } from "@/modules/identity/api/scopes";

type OpenApiOperation = Record<string, unknown>;
export type OpenApiDocument = {
  openapi?: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
  tags?: { name: string; description?: string }[];
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
  scope?: ApiScope;
  scopeAnyOf?: readonly ApiScope[];
  authorizationVariants?: readonly {
    discriminator: string;
    value: string;
    scope: ApiScope;
    capability?: string;
  }[];
  capability?: string;
  apiKey?: "allow" | "reject";
};
function response(path: string, method: string) {
  const key = `${method.toUpperCase()} ${legacyContractPath(path, method)}`;
  const contract = compatibilityContracts[key];
  if (!contract) throw new Error(`Missing OpenAPI contract owned by its route for ${key}`);
  const status = contract.successStatus ?? "200";
  if (status === "410")
    return { "410": errorResponse("This legacy write endpoint is no longer available") };
  if (status === "204")
    return { "204": { description: `${readableResource(path)} operation completed successfully` } };
  if (contract.response) return contract.response;
  if (!contract.responseSchema) throw new Error(`Missing explicit success schema for ${key}`);
  return {
    [status]: {
      description: contract.responseDescription ?? "Application API response",
      content: contract.responseContent ?? {
        "application/json": { schema: contract.responseSchema },
      },
    },
  };
}

function legacyContractPath(path: string, method: string) {
  if (path === "/api/checkout")
    return method.toUpperCase() === "GET" ? "/api/checkout-quote" : "/api/checkouts";
  if (path === "/api/checkout/{checkoutId}") return "/api/checkouts/{checkoutId}";
  if (path === "/api/checkout/{checkoutId}/pay") return "/api/checkouts/{checkoutId}/pay";
  return path;
}
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
  access: {
    mode: string;
    scope?: string;
    scopeAnyOf?: readonly ApiScope[];
    authorizationVariants?: OpenApiMetadataEntry["authorizationVariants"];
    capability?: string;
  },
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
  if (access.scopeAnyOf?.length) operation["x-required-api-scopes-any-of"] = [...access.scopeAnyOf];
  else delete operation["x-required-api-scopes-any-of"];
  if (access.authorizationVariants?.length)
    operation["x-authorization-variants"] = access.authorizationVariants.map((variant) => ({
      ...variant,
    }));
  else delete operation["x-authorization-variants"];

  if (access.mode === "mixed") {
    operation.security =
      access.scope || access.scopeAnyOf?.length ? [{}, { CliqeroApiKey: [] }] : [{}];
    return;
  }

  if (access.mode !== "account" && !access.scope && !access.scopeAnyOf?.length) {
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
  "Operator Overview":
    "A capability-scoped projection of current operator workload and catalogue state.",
  "Current Session": "Returns the authenticated browser session's current account projection.",
  "Account Access": "Returns access capabilities associated with the authenticated account.",
  "Funding Verification":
    "Development funding verification is available only in development and test environments.",
  Health: "Health checks report application availability without exposing persisted business data.",
  "Blog Posts": "Blog post operations preserve publication and editorial validation rules.",
  "Blog Categories": "Blog categories are independently managed persisted blog resources.",
  "Blog Tags": "Blog tags are independently exposed lookup records for blog content.",
  "Account Capabilities":
    "Account capability assignments are nested persisted resources managed through capability-administration authority.",
  "Listing Media": "Listing media operations enforce listing ownership and media validation.",
  "Listing Integrations":
    "Listing integration credentials are scoped to their owning listing; plaintext credentials are returned only when created or rotated.",
  "Catalogue Categories":
    "Catalogue categories are independently managed listing-classification resources.",
  Checkouts:
    "Checkout resource operations preserve payment, ownership, and purchase lifecycle invariants.",
  Distributions:
    "Distribution operations expose persisted distribution records under their own resource contract.",
  "Earning Entries":
    "Earning entry operations preserve accounting integrity and expose persisted entries under their own resource contract.",
  "Earnings Corrections":
    "Earnings corrections are immutable, source-linked recoveries of purchase-earning allocations.",
  "Treasury Entries":
    "Treasury entries are immutable accounting facts; corrections are new compensating entries.",
  "Package Entitlements":
    "Package entitlements are persisted access grants managed through their purchase and entitlement lifecycle.",
  Accounts:
    "Account operations use safe identity projections and enforce ownership or operator capability rules.",
  Listings:
    "Listing operations enforce seller ownership and the listing domain's supported lifecycle transitions.",
  Reviews:
    "Review operations preserve reviewer ownership and accept only supported moderation transitions.",
  Payments:
    "Payment resource operations expose provider-neutral records and preserve provider-owned payment facts.",
  "Payment Events":
    "Payment Event records preserve provider identity, deduplication keys, and immutable ingress evidence.",
  "Payment Reconciliations":
    "Payment reconciliation attempts are persisted, idempotent records of manual verification workflows; a key cannot be reused for another payment.",
  "Payment Reconciliation Candidates":
    "Candidate payments are a read-only projection of unresolved provider payments eligible for review.",
  "Funding Options":
    "Funding options are a read-only provider-neutral projection used before creating a funding transaction.",
  "Funding Methods":
    "Funding methods are configured provider mechanisms available to an account based on its country.",
  "Earnings Adjustments": "Earnings adjustments are immutable signed accounting correction facts.",
  "Checkout Quote": "A checkout quote is a read-only price and wallet-availability projection.",
  Purchases: "Purchase operations preserve payment, ownership, and purchase lifecycle rules.",
  "Wallet Summary": "The wallet summary is a computed, account-scoped balance projection.",
  "Wallet Transactions":
    "Wallet transactions are a read-only projection of posted account movements.",
  "Wallet Transfers": "Wallet transfers preserve the atomic transfer, earnings, and Treasury legs.",
  "Wallet Transfer Compensations":
    "Immutable, full-only wallet-transfer corrections that preserve original transfer evidence and safely reverse its wallet and Treasury effects.",
  "Wallet Transfer Quote": "A wallet transfer quote is a read-only fee and net-amount calculation.",
  "Funding Transactions":
    "Provider-neutral funding transactions are persisted and processed idempotently.",
  "Funding Reversals":
    "Funding reversals preserve confirmed provider evidence and expose immutable, auditable recovery allocations.",
  Withdrawals:
    "Withdrawal operations enforce account ownership, reserved-balance, and supported management transitions.",
  "Withdrawal Policy":
    "Withdrawal policy is a configured platform projection, not a persisted resource.",
  "Withdrawal Destinations":
    "Saved payout destinations are account-owned mutable resources; DELETE removes only the saved destination while historical withdrawal snapshots remain intact.",
  Hierarchy:
    "Hierarchy operations return only relationships authorized for the authenticated account or hierarchy manager.",
  Referrals:
    "Referral operations use the live referral graph and preserve attribution and authorization rules.",
  "Treasury Summary":
    "The Treasury summary is a computed projection over immutable accounting entries.",
  "Access Verification":
    "Access verification checks a purchase or entitlement without exposing unrelated account data.",
  "Earnings Summary": "Earnings is a computed, account-scoped balance and activity projection.",
  "Distribution Policy":
    "Distribution policy is a configured policy projection, not a persisted resource.",
  "Withdrawal Methods": "Withdrawal methods are a configured payout-method projection.",
  "Referral Network":
    "Referral operations expose authorized relationship queries and parent-management workflows.",
};

function domainForPath(path: string): string {
  if (path === "/api/overview") return "Operator Overview";
  if (path === "/api/me/session") return "Current Session";
  if (path === "/api/me/access") return "Account Access";
  if (path === "/api/me/listings") return "Listings";
  if (path === "/api/me/earnings/entries") return "Earning Entries";
  if (path === "/api/me/withdrawals/policy") return "Withdrawal Policy";
  if (path === "/api/me/profile" || path === "/api/me/onboarding") return "Accounts";
  if (path === "/api/package/entitlements" || path.startsWith("/api/package/entitlements/"))
    return "Package Entitlements";
  if (path === "/api/checkout") return "Checkout Quote";
  if (path.startsWith("/api/checkout/")) return "Checkouts";
  if (path.startsWith("/api/withdrawal-destinations")) return "Withdrawal Destinations";
  if (path === "/api/withdrawals/policy") return "Withdrawal Policy";
  if (path === "/api/withdrawal-methods") return "Withdrawal Methods";
  if (path === "/api/health") return "Health";
  if (path === "/api/access/verify") return "Access Verification";
  if (path.startsWith("/api/blog/posts")) return "Blog Posts";
  if (path.startsWith("/api/blog/categories")) return "Blog Categories";
  if (path.startsWith("/api/blog/tags")) return "Blog Tags";
  if (/^\/api\/accounts\/\{accountId\}\/capabilities/.test(path)) return "Account Capabilities";
  if (path.startsWith("/api/webhooks/") || path.includes("/ipn")) return "Payment Webhooks";
  if (path === "/api/package-entitlements" || path.startsWith("/api/package-entitlements/"))
    return "Package Entitlements";
  const relative = path.replace(/^\/api\//, "");
  if (relative.startsWith("accounts")) return "Accounts";
  if (relative.startsWith("password-reset")) return "Accounts";
  if (relative.includes("integrations")) return "Listing Integrations";
  if (relative.includes("/media") || relative.endsWith("/media")) return "Listing Media";
  if (relative.startsWith("catalogue/categories")) return "Catalogue Categories";
  if (relative.startsWith("catalogue")) return "Catalogue";
  if (relative.startsWith("listings")) return "Listings";
  if (relative.startsWith("blog")) return "Blog Posts";
  if (relative.startsWith("reviews")) return "Reviews";
  if (relative.startsWith("payment-events")) return "Payment Events";
  if (relative.startsWith("payments")) return "Payments";
  if (relative.startsWith("purchases")) return "Purchases";
  if (relative === "checkout-quote") return "Checkout Quote";
  if (relative === "checkouts" || relative.startsWith("checkouts/")) return "Checkouts";
  if (relative === "wallet") return "Wallet Summary";
  if (relative === "wallet/transactions") return "Wallet Transactions";
  if (relative === "wallet/transfers" || relative.startsWith("wallet/transfers/"))
    return "Wallet Transfers";
  if (relative.startsWith("wallet-transfer-compensations")) return "Wallet Transfer Compensations";
  if (relative === "wallet/transfer-quote") return "Wallet Transfer Quote";
  if (relative === "funding-options") return "Funding Options";
  if (relative === "funding-methods") return "Funding Methods";
  if (relative.startsWith("payment-reconciliations")) return "Payment Reconciliations";
  if (relative === "payment-reconciliation-candidates") return "Payment Reconciliation Candidates";
  if (relative.startsWith("payment-events")) return "Payment Events";
  if (relative.startsWith("earnings/adjustments")) return "Earnings Adjustments";
  if (relative.startsWith("earnings/corrections")) return "Earnings Corrections";
  if (relative === "funding-transactions" || relative.startsWith("funding-transactions/"))
    return "Funding Transactions";
  if (relative === "funding-reversals" || relative.startsWith("funding-reversals/"))
    return "Funding Reversals";
  if (relative.startsWith("withdrawal")) return "Withdrawals";
  if (relative.startsWith("hierarchy")) return "Hierarchy";
  if (relative.startsWith("referral")) return "Referral Network";
  if (relative.startsWith("treasury/entries")) return "Treasury Entries";
  if (relative.startsWith("treasury/expenses")) return "Treasury Entries";
  if (relative === "treasury") return "Treasury Summary";
  if (relative.startsWith("earnings/entries")) return "Earning Entries";
  if (relative.startsWith("distributions")) return "Distributions";
  if (relative === "earnings") return "Earnings Summary";
  if (relative === "distribution-policy") return "Distribution Policy";
  if (relative === "earnings/settlement") return "Earnings Settlement";
  throw new Error(`Public OpenAPI operation has no explicit owner: ${path}`);
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

function readableCollection(path: string) {
  const segments = path
    .replace(/^\/api\//, "")
    .split("/")
    .filter((segment) => segment && !/^\{.+\}$/.test(segment));
  return (segments.at(-1) ?? "resources").replaceAll("-", " ");
}

function operationSummary(path: string, method: string) {
  const resource = readableResource(path);
  if (path === "/api/overview") return "Get operator overview";
  if (path === "/api/health") return "Check API health";
  if (path === "/api/me/session") return "Get current session";
  if (path === "/api/me/access") return "Get current account access";
  if (path === "/api/checkout")
    return method === "get" ? "Quote checkout wallet requirement" : "Create checkout";
  if (path.startsWith("/api/checkout/"))
    return path.endsWith("/pay") ? "Pay for checkout" : "Get checkout";
  if (path === "/api/wallet") return "Get wallet summary";
  if (path === "/api/access/verify") return "Verify purchase access";
  if (path === "/api/referrals/direct") return "List direct referrals";
  if (path === "/api/referrals/downline") return "List referrals at a selected level";
  if (path === "/api/referrals/uplines") return "List account uplines";
  if (path === "/api/referrals/account-url") return "Get account referral URL";
  if (path === "/api/listings/{listingId}/access") return "Open listing access handoff";
  if (path === "/api/listings/{listingId}/referral-url") return "Get listing referral URL";
  if (path === "/api/listings/export") return "Export listings";
  if (path === "/api/listings/import") return "Import listings";
  if (path === "/api/checkout-quote") return "Quote checkout wallet requirement";
  if (path === "/api/wallet/transfer-quote") return "Quote a wallet transfer";
  if (path === "/api/wallet/transfers")
    return method === "get" ? "Quote a wallet transfer" : "Create a wallet transfer";
  if (path === "/api/earnings") return "Get earnings summary";
  if (path === "/api/distribution-policy") return "Get distribution policy";
  if (path === "/api/withdrawal-methods") return "List available withdrawal methods";
  if (path === "/api/withdrawals/policy") return "Get withdrawal policy";
  if (path === "/api/referrals/parent") return "Set an account's referral parent";
  if (path.endsWith("/reverse")) return "Reverse a purchase";
  if (path.endsWith("/settlement")) return "Settle earnings";
  if (path.endsWith("/reconcile"))
    return method === "get" ? "List payment reconciliation candidates" : "Reconcile a payment";
  if (path.endsWith("/rotate")) return "Rotate integration credential";
  if (path.startsWith("/api/withdrawals/") && path.endsWith("/cancel"))
    return "Cancel a withdrawal";
  if (path.endsWith("/verify"))
    return path.includes("/fund") ? "Verify funding" : "Verify resource status";
  if (path.endsWith("/cancel")) return "Cancel funding";
  if (path.endsWith("/pay")) return "Pay for checkout";
  if (path.endsWith("/provider-transaction")) return "Submit provider transaction identity";
  if (path.endsWith("/evidence")) return "Submit funding evidence";
  if (path.endsWith("/initialize")) return "Initialize funding";
  if (path.endsWith("/import")) return "Import listings";
  if (path.endsWith("/export")) return "Export listings";
  if (path.endsWith("/confirm-bank-transfer")) return "Confirm bank transfer funding";
  if (method === "get")
    return /^.*\/\{[^/]+\}$/.test(path) ? `Get ${resource}` : `List ${readableCollection(path)}`;
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
  if (status === "207") return "Import completed with per-record results";
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
    operation.description = `${summary}. ${domainDescriptions[tag] ?? ""}`.trim();
  }

  const contractPath = legacyContractPath(path, method);
  const operationKey = `${method.toUpperCase()} ${contractPath}`;
  const contract = compatibilityContracts[operationKey];
  const requestContract = contract?.requestBody;
  if (requestContract && !operation.requestBody)
    operation.requestBody = { ...requestContract, description: `${summary} request.` };

  const parameters = Array.isArray(operation.parameters)
    ? (operation.parameters as Record<string, unknown>[])
    : [];
  for (const parameter of contract?.parameters ?? [])
    if (!parameters.some((current) => current.in === "query" && current.name === parameter.name))
      parameters.push({
        ...parameter,
        in: "query",
        description: describeParameter(parameter.name),
      });
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
      const content = item.content;
      if (!content || typeof content !== "object") continue;
      for (const media of Object.values(content)) {
        if (!media || typeof media !== "object") continue;
        const mediaObject = media as Record<string, unknown>;
        const schema = mediaObject.schema;
        if (schema && typeof schema === "object" && !mediaObject.examples && !mediaObject.example) {
          const example =
            compatibilityExamples[`${method.toUpperCase()} ${path} response ${status}`] ??
            compatibilityExamples[`${operationKey} response ${status}`] ??
            syntheticExample(schema as Record<string, unknown>);
          if (example !== undefined) mediaObject.examples = { example: { value: example } };
        }
      }
    }
  }

  if (requestBody && typeof requestBody === "object") {
    const content = (requestBody as Record<string, unknown>).content;
    if (content && typeof content === "object")
      for (const media of Object.values(content)) {
        if (!media || typeof media !== "object") continue;
        const mediaObject = media as Record<string, unknown>;
        const schema = mediaObject.schema;
        if (schema && typeof schema === "object" && !mediaObject.examples && !mediaObject.example) {
          const example =
            compatibilityExamples[`${method.toUpperCase()} ${path} request`] ??
            compatibilityExamples[`${operationKey} request`] ??
            syntheticExample(schema as Record<string, unknown>);
          if (example !== undefined) mediaObject.examples = { example: { value: example } };
        }
      }
  }
}

function syntheticExample(schema: Record<string, unknown>, propertyName = ""): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (Array.isArray(schema.oneOf) && schema.oneOf.length)
    return syntheticExample(schema.oneOf[0] as Record<string, unknown>, propertyName);
  if (Array.isArray(schema.anyOf) && schema.anyOf.length)
    return syntheticExample(schema.anyOf[0] as Record<string, unknown>, propertyName);
  if (
    schema.type === "object" &&
    (!schema.properties || typeof schema.properties !== "object") &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  )
    return { example: syntheticExample(schema.additionalProperties as Record<string, unknown>) };
  if (schema.type === "object" && schema.properties && typeof schema.properties === "object") {
    return Object.fromEntries(
      Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(
        ([name, child]) => [name, syntheticExample(child, name)],
      ),
    );
  }
  if (schema.type === "array") {
    const items = schema.items;
    return [
      items && typeof items === "object"
        ? syntheticExample(items as Record<string, unknown>)
        : "example",
    ];
  }
  if (schema.type === "string") {
    if (schema.format === "uuid") return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    if (schema.format === "date-time") return "2026-10-04T01:00:00.000Z";
    if (schema.format === "email") return "operator@example.test";
    if (schema.format === "uri" || schema.format === "url") return "https://example.test/resource";
    if (propertyName.includes("amount") || propertyName.endsWith("_minor")) return "3100";
    if (propertyName.includes("currency")) return "USD";
    if (propertyName.includes("username")) return "example_user";
    if (propertyName.includes("state")) return "pending";
    if (propertyName.includes("provider")) return "paystack";
    if (propertyName.includes("reference")) return "pay-example-reference";
    if (propertyName.includes("url")) return "https://example.test/resource";
    if (propertyName.includes("id")) return "example-id";
    return "example";
  }
  if (schema.type === "integer" || schema.type === "number")
    return typeof schema.minimum === "number" ? schema.minimum : 1;
  if (schema.type === "boolean") return true;
  return undefined;
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
      "Use an existing Cliqero API key as Authorization: Bearer <key>. Required scopes are exposed through x-required-api-scope or the structured x-required-api-scopes-any-of extension; conditional authorization is described in x-authorization-variants.",
  };

  for (const route of legacyRoutes) {
    const path = (document.paths[route.path] ??= {});
    for (const routeMethod of route.methods) {
      const method = routeMethod.method.toLowerCase();
      const operation = (path[method] ??= {
        responses: {
          ...response(route.path, method),
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
      if (path === "/api/openapi.json") continue;
      enrichOperation(path, method, operation);
      tagNames.add(String((operation.tags as string[])[0]));
    }
  (document as Record<string, unknown>).tags = [...tagNames].sort().map((name) => ({
    name,
    description: domainDescriptions[name] ?? "Public API operations for this concern.",
  }));

  document.components.schemas = {
    ...(document.components.schemas as Record<string, unknown> | undefined),
    ...generatedZodComponents(),
  };

  normalizeAuthorizationResponses(document);
}
