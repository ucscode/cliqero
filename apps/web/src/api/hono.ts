import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import type { ApiPrincipal } from "@/modules/identity/api-principal";
import { apiScopeSchema, operatorCapabilitiesForScope } from "@/modules/identity/api-scopes";
import { canAccessOperator, hasCapability, type Capability } from "@/modules/identity/capabilities";
import { dispatchLegacyApi, legacyApiPaths } from "./legacy-dispatch";
import { publicErrorPayload, validationErrorPayload } from "./error";
import { logDevelopmentError } from "@/infrastructure/development-log";
import { newId } from "@/kernel/ids";
import { blogPostInputSchema } from "@/modules/blog/domain/blog";
import {
  canReadOpenApiSchema,
  loadOpenApiSchemaAccess,
  type OpenApiSchemaAccess,
} from "@/security/openapi";

type Env = { Variables: { principal: ApiPrincipal | null } };
const errorSchema = z.object({ error: z.string(), code: z.string().optional() });
const nodeSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  depth: z.number(),
  directChildCount: z.number(),
  hasChildren: z.boolean(),
  hasMoreChildren: z.boolean(),
  nextChildCursor: z.string().nullable(),
});
const parentSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  canNavigate: z.boolean(),
});
const treeSchema = z.object({
  root: z.string(),
  windowDepth: z.number(),
  childLimit: z.number(),
  parent: parentSchema.nullable(),
  nodes: z.array(nodeSchema),
  edges: z.array(z.object({ parent: z.string(), child: z.string() })),
});
const childrenSchema = z.object({
  parentId: z.string(),
  items: z.array(nodeSchema),
  nextCursor: z.string().nullable(),
});
const reassignmentSchema = z.object({
  childAccountId: z.string(),
  parentAccountId: z.string(),
  previousParentAccountId: z.string().nullable(),
  changed: z.boolean(),
});
const accountAccessSchema = z.object({
  accountId: z.string().uuid(),
  capabilities: z.array(z.string()),
  canAccessOperator: z.boolean(),
});
const operatorOverviewSchema = z.object({
  capabilities: z.array(z.string()),
  catalogue: z.object({
    published: z.number().int().nonnegative(),
    draft: z.number().int().nonnegative(),
    archived: z.number().int().nonnegative(),
  }),
  users: z.object({ total: z.number().int().nonnegative() }).optional(),
  commerce: z.object({ purchases: z.number().int().nonnegative() }).optional(),
  withdrawals: z
    .object({
      requested: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
    })
    .optional(),
});
const operatorAccountSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.string(),
  directReferralCount: z.number().int().nonnegative(),
});
const operatorAccountDetailSchema = operatorAccountSummarySchema.extend({
  parent: z
    .object({ id: z.string().uuid(), username: z.string(), displayName: z.string().nullable() })
    .nullable(),
  purchaseCount: z.number().int().nonnegative(),
  latestParentReassignment: z
    .object({
      actorId: z.string().uuid().nullable(),
      previousParentId: z.string().uuid().nullable(),
      parentId: z.string().uuid().nullable(),
      occurredAt: z.string(),
    })
    .nullable(),
});
const capabilityAssignmentSchema = z.object({
  capability: z.string(),
  grantedAt: z.string(),
});
const capabilityAdministrationSchema = z.object({
  accountId: z.string().uuid(),
  assignments: z.array(capabilityAssignmentSchema),
  manageableCapabilities: z.array(z.string()),
  isSelf: z.boolean(),
});
const operatorApiKeyMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key_prefix: z.string(),
  scopes: z.array(z.string()),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
const operatorApiKeyListSchema = z.object({
  items: z.array(operatorApiKeyMetadataSchema),
  manageable_scopes: z.array(z.string()),
});
const fundingStateSchema = z.enum([
  "initialization_pending",
  "initializing",
  "awaiting_payment",
  "verification_pending",
  "confirmed",
  "failed",
  "blocked",
  "reconciliation_pending",
]);
const operatorFundingWalletCreditSchema = z.object({
  id: z.string().uuid(),
  amountMinor: z.string(),
  currency: z.string(),
  state: z.enum(["pending", "available"]),
  createdAt: z.string(),
  availableAt: z.string().nullable(),
});
const operatorFundingSummarySchema = z.object({
  id: z.string().uuid(),
  account: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  provider: z.string(),
  providerReference: z.string(),
  canonicalAmountMinor: z.string(),
  canonicalCurrency: z.literal("USD"),
  collectionAmountMinor: z.string(),
  collectionCurrency: z.string(),
  state: fundingStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  confirmedAt: z.string().nullable(),
  walletCredit: operatorFundingWalletCreditSchema.nullable(),
});
const operatorFundingDetailSchema = operatorFundingSummarySchema.extend({
  conversionSnapshot: z
    .object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      rate: z.string(),
      source: z.string(),
      sourceDate: z.string(),
      observedAt: z.string(),
    })
    .nullable(),
  providerInitialization: z.object({ authorizationUrl: z.string().nullable() }).nullable(),
  operations: z.array(
    z.object({
      id: z.string().uuid(),
      operation: z.string(),
      outcome: z.enum(["succeeded", "failed"]),
      httpStatus: z.number().int().nullable(),
      providerStatus: z.boolean().nullable(),
      providerMessage: z.string().nullable(),
      providerCode: z.string().nullable(),
      failureKind: z.string().nullable(),
      occurredAt: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string().uuid(),
      eventType: z.string(),
      providerReference: z.string().nullable(),
      amountMinor: z.string().nullable(),
      currency: z.string().nullable(),
      state: z.enum(["received", "processed", "rejected", "ignored"]),
      lastError: z.string().nullable(),
      receivedAt: z.string(),
      processedAt: z.string().nullable(),
      outboxState: z.string().nullable(),
      outboxLastError: z.string().nullable(),
    }),
  ),
  evidence: z
    .object({
      id: z.string().uuid(),
      transferReference: z.string().nullable(),
      proofImageUrl: z.string().nullable(),
      customerNote: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
});
const operatorDistributionSummarySchema = z.object({
  id: z.string().uuid(),
  purchaseId: z.string().uuid(),
  listingId: z.string().uuid(),
  listingTitle: z.string(),
  buyer: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  grossAmountMinor: z.string(),
  currency: z.string(),
  referralAllocatedMinor: z.string(),
  platformRemainderMinor: z.string(),
  beneficiaryCount: z.number().int().nonnegative(),
  completedAt: z.string(),
});
const operatorDistributionDetailSchema = operatorDistributionSummarySchema.extend({
  purchaseState: z.string(),
  purchaseCreatedAt: z.string(),
  attribution: z.object({
    id: z.string().uuid().nullable(),
    referrer: z
      .object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() })
      .nullable(),
  }),
  policySnapshot: z.unknown(),
  allocations: z.array(
    z.object({
      id: z.string().uuid(),
      account: z.object({
        id: z.string().uuid(),
        username: z.string(),
        email: z.string().nullable(),
      }),
      level: z.number().int().positive().nullable(),
      amountMinor: z.string(),
      currency: z.string(),
      direction: z.enum(["credit", "debit"]),
      entryType: z.string(),
      balanceState: z.string(),
      maturityAt: z.string().nullable(),
      settledAt: z.string().nullable(),
      originalEntryId: z.string().uuid().nullable(),
      reversalId: z.string().uuid().nullable(),
      createdAt: z.string(),
    }),
  ),
  reversal: z
    .object({
      id: z.string().uuid(),
      reason: z.string(),
      source: z.string(),
      state: z.string(),
      processedAt: z.string().nullable(),
    })
    .nullable(),
});
const operatorEarningsEntrySchema = z.object({
  id: z.string().uuid(),
  account: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  purchaseId: z.string().uuid().nullable(),
  distributionId: z.string().uuid().nullable(),
  entryType: z.string(),
  direction: z.enum(["credit", "debit"]),
  amountMinor: z.string(),
  currency: z.string(),
  level: z.number().int().positive().nullable(),
  balanceState: z.string(),
  settledAt: z.string().nullable(),
  createdAt: z.string(),
});
const operatorWithdrawalStateSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "failed",
]);
const operatorWithdrawalAttentionSchema = z.enum([
  "review",
  "payout",
  "reconciliation",
  "retry",
  "retry_wait",
  "none",
]);
const operatorWithdrawalSchema = z.object({
  id: z.string().uuid(),
  account: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  amountMinor: z.string(),
  currency: z.string(),
  destination: z.object({ type: z.enum(["bank", "manual"]), summary: z.string() }),
  state: operatorWithdrawalStateSchema,
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  reservation: z
    .object({
      amountMinor: z.string(),
      currency: z.string(),
      state: z.enum(["reserved", "released", "completed"]),
    })
    .nullable(),
  payout: z
    .object({
      provider: z.string(),
      state: z.enum(["ready", "submitted", "succeeded", "failed", "unknown"]),
      attemptCount: z.number().int(),
      nextAttemptAt: z.string().nullable(),
      lastError: z.string().nullable(),
      providerReference: z.string().nullable(),
    })
    .nullable(),
  attention: operatorWithdrawalAttentionSchema,
});
const operatorWithdrawalDetailSchema = operatorWithdrawalSchema.extend({
  attempts: z.array(
    z.object({
      id: z.string().uuid(),
      number: z.number().int(),
      provider: z.string(),
      state: z.string(),
      providerReference: z.string().nullable(),
      failureCategory: z.string().nullable(),
      failureReason: z.string().nullable(),
      createdAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
});
const operatorTreasuryEntrySchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(["credit", "debit"]),
  amountMinor: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  source: z.object({ kind: z.string(), id: z.string().uuid() }).nullable(),
  actor: z
    .object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() })
    .nullable(),
  createdAt: z.string(),
});
const operatorTreasurySummarySchema = z.object({
  balanceMinor: z.string(),
  creditsMinor: z.string(),
  debitsMinor: z.string(),
  currency: z.literal("USD"),
});
const blogPostSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  content: z.string(),
  status: z.enum(["draft", "published"]),
  featuredImageUrl: z.string().nullable(),
  authorAccountId: z.string().uuid().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  category: z.object({ slug: z.string(), name: z.string() }).nullable(),
  tags: z.array(z.object({ slug: z.string(), name: z.string() })),
});
const blogPageSchema = z.object({
  items: z.array(blogPostSchema),
  nextCursor: z.string().nullable(),
  limit: z.number().int(),
});
function principal(c: any) {
  return c.get("principal") as ApiPrincipal | null;
}
function requirePrincipal(c: any) {
  const p = principal(c);
  if (!p) {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized", code: "unauthorized" }, 401);
  }
  return p;
}
function requireScope(c: any, p: ApiPrincipal, scope: string) {
  if (p.kind === "api_key" && !p.scopes.has(scope)) {
    return c.json({ error: "Forbidden", code: "insufficient_scope" }, 403);
  }
  return null;
}
function requireCapabilityScope(c: any, p: ApiPrincipal, capability: Capability, scope: string) {
  if (!hasCapability(p.capabilities, capability))
    return c.json({ error: "Forbidden", code: "forbidden" }, 403);
  return requireScope(c, p, scope);
}
function requireSessionCapability(c: any, p: ApiPrincipal, capability: Capability) {
  if (p.kind !== "user_session")
    return c.json({ error: "A browser session is required.", code: "session_required" }, 403);
  if (!hasCapability(p.capabilities, capability))
    return c.json({ error: "Forbidden", code: "forbidden" }, 403);
  return null;
}
function reviewJson(review: any, options: { reviewer?: string; isMine?: boolean } = {}) {
  return {
    id: review.id,
    listing_id: review.listingId,
    rating: review.rating,
    body: review.body,
    status: review.status,
    created_at: review.createdAt.toISOString(),
    updated_at: review.updatedAt.toISOString(),
    moderated_at: review.moderatedAt?.toISOString() ?? null,
    ...((options.reviewer ?? review.reviewer)
      ? { reviewer: options.reviewer ?? review.reviewer }
      : {}),
    ...(options.isMine ? { is_mine: true } : {}),
    ...(review.listingTitle ? { listing_title: review.listingTitle } : {}),
  };
}
function blogJson(post: any) {
  if (!post) return null;
  return {
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}
function hierarchyReadOrAdmin(c: any, p: ApiPrincipal) {
  if (p.kind === "api_key" && p.scopes.has("hierarchy:admin")) return null;
  return requireScope(c, p, "hierarchy:read");
}
function grantableScopes(p: ApiPrincipal): Set<string> {
  const allowed = new Set([
    "hierarchy:read",
    "api_keys:manage",
    "catalogue:read",
    "wallet:read",
    "wallet:fund",
    "checkout:create",
    "purchases:read",
    "referrals:read",
    "referrals:manage",
    "earnings:read",
    "withdrawals:read",
    "withdrawals:create",
  ]);
  if (hasCapability(p.capabilities, "catalogue.manage")) allowed.add("catalogue:manage");
  if (hasCapability(p.capabilities, "hierarchy.manage")) allowed.add("hierarchy:admin");
  if (hasCapability(p.capabilities, "withdrawals.manage")) allowed.add("withdrawals:manage");
  if (hasCapability(p.capabilities, "treasury.manage")) {
    allowed.add("treasury:read");
    allowed.add("treasury:manage");
  }
  if (
    operatorCapabilitiesForScope("operations:manage").every((capability) =>
      hasCapability(p.capabilities, capability),
    )
  )
    allowed.add("operations:manage");
  if (hasCapability(p.capabilities, "content.manage"))
    for (const scope of ["blog:read", "blog:write", "blog:publish", "blog:manage"])
      allowed.add(scope);
  if (hasCapability(p.capabilities, "reviews.moderate")) allowed.add("reviews:moderate");
  return allowed;
}
function domainError(c: any, error: unknown) {
  const publicError = publicErrorPayload(error);
  const validation = validationErrorPayload(error);
  logDevelopmentError(error, {
    event: "api.error",
    method: c.req.raw.method,
    path: new URL(c.req.raw.url).pathname,
    ...(publicError
      ? { publicCode: publicError.payload.code }
      : validation
        ? { publicCode: validation.code }
        : {}),
  });
  if (publicError) return c.json(publicError.payload, publicError.status);
  if (validation) return c.json(validation, 400);
  const message = error instanceof Error ? error.message : "Request failed";
  const status =
    message === "Forbidden"
      ? 403
      : message.toLowerCase().includes("not found")
        ? 404
        : message.toLowerCase().includes("already")
          ? 409
          : 400;
  return c.json(
    {
      error: message,
      code:
        status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : status === 409
              ? "conflict"
              : "invalid_request",
    },
    status,
  );
}
function jsonSafe(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  );
}

export function createApiApp(
  container: ApplicationContainer,
  schemaAccess: OpenApiSchemaAccess = loadOpenApiSchemaAccess(),
) {
  const app = new OpenAPIHono<Env>();
  app.onError((error, c) => domainError(c, error));
  app.use("/api/*", async (c, next) => {
    const p = await container.principalResolver.resolve(c.req.raw);
    c.set("principal", p);
    await next();
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/openapi.json",
      responses: {
        200: {
          description: "OpenAPI document",
          content: { "application/json": { schema: z.any() } },
        },
        404: {
          description: "Not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      if (!canReadOpenApiSchema(schemaAccess, c.req.header("x-openapi-key")))
        return c.json({ error: "Not found", code: "not_found" }, 404);
      const document = app.getOpenAPIDocument({
        openapi: "3.0.0",
        info: { title: "Cliqero API", version: "1.0.0" },
        servers: [{ url: "/" }],
      }) as any;
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
      for (const route of legacyApiPaths) {
        const path = (document.paths[route.path] ??= {});
        for (const routeMethod of route.methods) {
          const operation = routeMethod.method.toLowerCase();
          path[operation] ??= {
            "x-authentication-mode": routeMethod.access.mode,
            ...(routeMethod.access.scope
              ? { "x-required-api-scope": routeMethod.access.scope }
              : {}),
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
      const overview = document.paths["/api/operator/overview"]?.get;
      if (overview) {
        overview["x-authentication-mode"] = "account";
        overview["x-required-api-scope"] = "operations:manage";
      }
      for (const path of ["/api/operator/accounts", "/api/operator/accounts/{accountId}"]) {
        const operation = document.paths[path]?.get;
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] = "operations:manage";
        }
      }
      for (const path of ["/api/operator/funding", "/api/operator/funding/{fundingId}"]) {
        const operation = document.paths[path]?.get;
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] = "operations:manage";
        }
      }
      for (const path of [
        "/api/operator/distributions",
        "/api/operator/distributions/{distributionId}",
        "/api/operator/earnings",
      ]) {
        const operation = document.paths[path]?.get;
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] = "operations:manage";
        }
      }
      for (const path of [
        "/api/operator/blog",
        "/api/blog/posts",
        "/api/blog/posts/{id}",
        "/api/blog/posts/{id}/publish",
        "/api/blog/posts/{id}/unpublish",
      ]) {
        const pathItem = document.paths[path];
        if (pathItem)
          for (const [method, operation] of Object.entries(pathItem) as any[])
            if (operation && typeof operation === "object") {
              operation["x-authentication-mode"] =
                path === "/api/blog/posts" && method === "get" ? "public" : "account";
              operation["x-required-api-scope"] =
                method === "post" && path.endsWith("publish")
                  ? "blog:publish"
                  : method === "delete"
                    ? "blog:manage"
                    : method === "patch" || method === "post"
                      ? "blog:write"
                      : "blog:read";
            }
      }
      for (const path of [
        "/api/operator/withdrawals",
        "/api/operator/withdrawals/{withdrawalId}",
        "/api/operator/withdrawals/{withdrawalId}/approve",
        "/api/operator/withdrawals/{withdrawalId}/reject",
        "/api/operator/withdrawals/{withdrawalId}/payout",
        "/api/operator/withdrawals/{withdrawalId}/payout/reconcile",
        "/api/operator/withdrawals/{withdrawalId}/complete",
      ]) {
        const pathItem = document.paths[path];
        if (pathItem)
          for (const operation of Object.values(pathItem) as any[]) {
            if (operation && typeof operation === "object") {
              operation["x-authentication-mode"] = "account";
              operation["x-required-api-scope"] = "withdrawals:manage";
            }
          }
      }
      for (const [path, method] of [
        ["/api/operator/treasury", "get"],
        ["/api/operator/treasury/entries", "get"],
        ["/api/operator/treasury/entries/{entryId}", "get"],
        ["/api/operator/treasury/entries", "post"],
      ] as const) {
        const operation = document.paths[path]?.[method];
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] =
            method === "post" ? "treasury:manage" : "treasury:read";
        }
      }
      const access = document.paths["/api/me/access"]?.get;
      if (access) access["x-authentication-mode"] = "account";
      return c.json(document);
    },
  );
  const blogListQuery = z.object({
    search: z.string().max(100).optional(),
    status: z.enum(["draft", "published"]).optional(),
    category: z.string().max(100).optional(),
    tag: z.string().max(100).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/posts",
      request: { query: blogListQuery },
      responses: {
        200: {
          description: "Published blog posts",
          content: { "application/json": { schema: blogPageSchema } },
        },
      },
    }),
    (c) => {
      try {
        const page = container.blog.list({ ...c.req.valid("query"), publishedOnly: true });
        return c.json({ ...page, items: page.items.map(blogJson) }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/posts/{slug}",
      request: { params: z.object({ slug: z.string().min(1).max(160) }) },
      responses: {
        200: {
          description: "Published blog post",
          content: { "application/json": { schema: blogPostSchema } },
        },
        404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const post = container.blog.get(c.req.valid("param").slug, true);
      return post
        ? c.json(blogJson(post), 200)
        : c.json({ error: "Blog post not found", code: "not_found" }, 404);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/categories",
      responses: {
        200: {
          description: "Blog categories",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
              }),
            },
          },
        },
      },
    }),
    (c) =>
      c.json(
        { items: container.blog.categories() as Array<{ id: string; slug: string; name: string }> },
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/tags",
      responses: {
        200: {
          description: "Blog tags",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
              }),
            },
          },
        },
      },
    }),
    (c) =>
      c.json(
        { items: container.blog.tags() as Array<{ id: string; slug: string; name: string }> },
        200,
      ),
  );
  const blogAdminListQuery = blogListQuery.extend({});
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/blog",
      request: { query: blogAdminListQuery },
      responses: {
        200: {
          description: "Operator blog posts",
          content: { "application/json": { schema: blogPageSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:read");
      if (denied) return denied;
      const page = container.blog.list(c.req.valid("query"));
      return c.json({ ...page, items: page.items.map(blogJson) }, 200);
    },
  );
  const blogWriteBody = blogPostInputSchema;
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/blog/posts",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: { content: { "application/json": { schema: blogWriteBody } } },
      },
      responses: {
        201: {
          description: "Blog post created",
          content: { "application/json": { schema: blogPostSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        if (body.status === "published" && p.kind === "api_key" && !p.scopes.has("blog:publish"))
          return c.json({ error: "Forbidden", code: "insufficient_scope" }, 403);
        const key = c.req.header("Idempotency-Key");
        if (!key) throw new Error("Idempotency-Key is required");
        return c.json(blogJson(container.blog.create(body, p.accountId, key)), 201);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/blog/posts/{id}",
      request: {
        params: z.object({ id: z.string().uuid() }),
        body: { content: { "application/json": { schema: blogWriteBody.partial() } } },
      },
      responses: {
        200: {
          description: "Blog post updated",
          content: { "application/json": { schema: blogPostSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        if (body.status === "published" && p.kind === "api_key" && !p.scopes.has("blog:publish"))
          return c.json({ error: "Forbidden", code: "insufficient_scope" }, 403);
        return c.json(blogJson(container.blog.update(c.req.valid("param").id, body)), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  for (const [path, published] of [
    ["/api/blog/posts/{id}/publish", true],
    ["/api/blog/posts/{id}/unpublish", false],
  ] as const) {
    app.openapi(
      createRoute({
        method: "post",
        path,
        request: { params: z.object({ id: z.string().uuid() }) },
        responses: {
          200: {
            description: "Blog publication state changed",
            content: { "application/json": { schema: blogPostSchema } },
          },
          403: {
            description: "Forbidden",
            content: { "application/json": { schema: errorSchema } },
          },
        },
      }),
      (c) => {
        const p = requirePrincipal(c);
        if (!(p instanceof Object) || !("accountId" in p)) return p;
        const denied = requireCapabilityScope(c, p, "content.manage", "blog:publish");
        if (denied) return denied;
        try {
          return c.json(blogJson(container.blog.publish(c.req.valid("param").id, published)), 200);
        } catch (error) {
          return domainError(c, error);
        }
      },
    );
  }
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/blog/posts/{id}",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        204: { description: "Blog post deleted" },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:manage");
      if (denied) return denied;
      try {
        container.blog.delete(c.req.valid("param").id);
        return c.body(null, 204);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const accountListQuery = z.object({
    search: z.string().max(100).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts",
      request: { query: accountListQuery },
      responses: {
        200: {
          description: "Bounded operator account search",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorAccountSummarySchema),
                nextCursor: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorAccounts.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const operatorFundingQuery = z.object({
    search: z.string().max(100).optional(),
    state: fundingStateSchema.optional(),
    provider: z
      .string()
      .regex(/^[a-z0-9_-]{1,50}$/)
      .optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/funding",
      request: { query: operatorFundingQuery },
      responses: {
        200: {
          description: "Bounded operator funding inspection",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorFundingSummarySchema),
                nextCursor: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorFunding.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/funding/{fundingId}",
      request: { params: z.object({ fundingId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator funding detail",
          content: { "application/json": { schema: operatorFundingDetailSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Funding not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorFunding.get(c.req.valid("param").fundingId), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/funding/{fundingId}/confirm-bank-transfer",
      request: { params: z.object({ fundingId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Bank-transfer funding confirmed",
          content: {
            "application/json": {
              schema: z.object({
                id: z.string().uuid(),
                state: z.literal("confirmed"),
                confirmedAt: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Finance management capability required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Funding not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.manage", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorFunding.confirmBankTransfer(
            p.accountId,
            c.req.valid("param").fundingId,
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts/{accountId}",
      request: { params: z.object({ accountId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator account projection",
          content: { "application/json": { schema: operatorAccountDetailSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorAccounts.get(c.req.valid("param").accountId), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const capabilityParams = z.object({ accountId: z.string().uuid() });
  const capabilityBody = z.object({ capability: z.string().min(1).max(64) }).strict();
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts/{accountId}/capabilities",
      request: { params: capabilityParams },
      responses: {
        200: {
          description: "Direct capability assignments",
          content: { "application/json": { schema: capabilityAdministrationSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Capability administration access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireSessionCapability(c, p, "capabilities.manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.capabilityAdministration.inspect(
            p.accountId,
            c.req.valid("param").accountId,
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/accounts/{accountId}/capabilities",
      request: {
        params: capabilityParams,
        body: { content: { "application/json": { schema: capabilityBody } } },
      },
      responses: {
        200: {
          description: "Capability grant result",
          content: {
            "application/json": {
              schema: z.object({
                accountId: z.string().uuid(),
                capability: z.string(),
                changed: z.boolean(),
                assigned: z.boolean(),
                grantedAt: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Capability administration access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Capability conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireSessionCapability(c, p, "capabilities.manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.capabilityAdministration.grant(
            p.accountId,
            c.req.valid("param").accountId,
            c.req.valid("json").capability,
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/operator/accounts/{accountId}/capabilities/{capability}",
      request: { params: capabilityParams.extend({ capability: z.string().min(1).max(64) }) },
      responses: {
        200: {
          description: "Capability revoke result",
          content: {
            "application/json": {
              schema: z.object({
                accountId: z.string().uuid(),
                capability: z.string(),
                changed: z.boolean(),
                assigned: z.boolean(),
                grantedAt: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Capability administration access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "The final root cannot be removed",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireSessionCapability(c, p, "capabilities.manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.capabilityAdministration.revoke(
            p.accountId,
            c.req.valid("param").accountId,
            c.req.valid("param").capability,
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const operatorDistributionQuery = z.object({
    search: z.string().max(100).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/distributions",
      request: { query: operatorDistributionQuery },
      responses: {
        200: {
          description: "Bounded operator distribution inspection",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorDistributionSummarySchema),
                nextCursor: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorDistributions.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/distributions/{distributionId}",
      request: { params: z.object({ distributionId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator distribution detail",
          content: { "application/json": { schema: operatorDistributionDetailSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Distribution not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorDistributions.get(c.req.valid("param").distributionId),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const operatorEarningsQuery = z.object({
    search: z.string().max(100).optional(),
    state: z.enum(["pending", "available", "reversed"]).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/earnings",
      request: { query: operatorEarningsQuery },
      responses: {
        200: {
          description: "Bounded operator earnings ledger inspection",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorEarningsEntrySchema),
                nextCursor: z.string().nullable(),
                totals: z.object({
                  pendingMinor: z.string(),
                  availableMinor: z.string(),
                  reservedMinor: z.string(),
                }),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorEarnings.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/me/access",
      responses: {
        200: {
          description: "Current account capabilities and safe application access flags",
          content: { "application/json": { schema: accountAccessSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      return c.json(
        {
          accountId: p.accountId,
          capabilities: [...p.capabilities],
          canAccessOperator: canAccessOperator(p.capabilities),
        },
        200,
      );
    },
  );
  const operatorWithdrawalQuery = z.object({
    search: z.string().max(100).optional(),
    state: operatorWithdrawalStateSchema.optional(),
    attention: operatorWithdrawalAttentionSchema.optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/withdrawals",
      request: { query: operatorWithdrawalQuery },
      responses: {
        200: {
          description: "Bounded operator withdrawal inspection",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorWithdrawalSchema),
                nextCursor: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorWithdrawals.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/withdrawals/{withdrawalId}",
      request: { params: z.object({ withdrawalId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator withdrawal detail",
          content: { "application/json": { schema: operatorWithdrawalDetailSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Withdrawal not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorWithdrawals.get(c.req.valid("param").withdrawalId),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const withdrawalParam = { params: z.object({ withdrawalId: z.string().uuid() }) };
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/withdrawals/{withdrawalId}/approve",
      request: withdrawalParam,
      responses: {
        200: {
          description: "Withdrawal approved",
          content: { "application/json": { schema: z.any() } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        return c.json(
          jsonSafe(
            await container.withdrawals.approve(p.accountId, c.req.valid("param").withdrawalId),
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/withdrawals/{withdrawalId}/reject",
      request: {
        ...withdrawalParam,
        body: {
          content: {
            "application/json": {
              schema: z.object({ reason: z.string().min(3).max(500) }).strict(),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Withdrawal rejected",
          content: { "application/json": { schema: z.any() } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        return c.json(
          jsonSafe(
            await container.withdrawals.reject(
              p.accountId,
              c.req.valid("param").withdrawalId,
              c.req.valid("json").reason,
            ),
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  for (const [path, operation] of [
    ["/api/operator/withdrawals/{withdrawalId}/payout", "payout"],
    ["/api/operator/withdrawals/{withdrawalId}/payout/reconcile", "reconcile"],
    ["/api/operator/withdrawals/{withdrawalId}/complete", "complete"],
  ] as const) {
    app.openapi(
      createRoute({
        method: "post",
        path,
        request: withdrawalParam,
        responses: {
          200: {
            description: "Withdrawal operation",
            content: { "application/json": { schema: z.any() } },
          },
          401: {
            description: "Authentication required",
            content: { "application/json": { schema: errorSchema } },
          },
          403: {
            description: "Operator access required",
            content: { "application/json": { schema: errorSchema } },
          },
        },
      }),
      async (c) => {
        const p = requirePrincipal(c);
        if (!(p instanceof Object) || !("accountId" in p)) return p;
        const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
        if (denied) return denied;
        try {
          const id = c.req.valid("param").withdrawalId;
          const result =
            operation === "payout"
              ? await container.payoutExecution.execute(id, newId())
              : operation === "reconcile"
                ? await container.payoutExecution.reconcile(id, newId())
                : await container.payoutExecution.manualComplete(id, p.accountId, newId());
          return c.json(jsonSafe(result), 200);
        } catch (error) {
          return domainError(c, error);
        }
      },
    );
  }
  const treasuryEntryQuery = z.object({
    search: z.string().max(100).optional(),
    direction: z.enum(["credit", "debit"]).optional(),
    source: z.enum(["automatic", "manual"]).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/treasury",
      responses: {
        200: {
          description: "Operator treasury summary",
          content: { "application/json": { schema: operatorTreasurySummarySchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "treasury.manage", "treasury:read");
      if (denied) return denied;
      try {
        return c.json(await container.operatorTreasury.summary(), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/treasury/entries",
      request: { query: treasuryEntryQuery },
      responses: {
        200: {
          description: "Bounded operator treasury entries",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorTreasuryEntrySchema),
                nextCursor: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "treasury.manage", "treasury:read");
      if (denied) return denied;
      try {
        return c.json(await container.operatorTreasury.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/treasury/entries/{entryId}",
      request: { params: z.object({ entryId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Treasury entry detail",
          content: { "application/json": { schema: operatorTreasuryEntrySchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Treasury entry not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "treasury.manage", "treasury:read");
      if (denied) return denied;
      try {
        return c.json(await container.operatorTreasury.get(c.req.valid("param").entryId), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const treasuryEntryBody = z
    .object({
      direction: z.enum(["credit", "debit"]),
      amount_minor: z
        .string()
        .regex(/^[1-9]\d*$/)
        .max(18),
      title: z.string().trim().min(1).max(200),
      note: z.string().trim().max(1000).optional(),
    })
    .strict();
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/treasury/entries",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: { content: { "application/json": { schema: treasuryEntryBody } } },
      },
      responses: {
        201: {
          description: "Treasury entry created",
          content: { "application/json": { schema: operatorTreasuryEntrySchema } },
        },
        400: {
          description: "Invalid treasury entry",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Idempotency conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "treasury.manage", "treasury:manage");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        const entry = await container.treasury.createManual({
          direction: body.direction,
          amountMinor: BigInt(body.amount_minor),
          title: body.title,
          note: body.note,
          actorId: p.accountId,
          idempotencyKey:
            c.req.header("Idempotency-Key") ??
            (() => {
              throw new Error("A valid Idempotency-Key is required");
            })(),
        });
        const actor = await container.profiles.get(p.accountId);
        return c.json(
          jsonSafe({
            id: entry.id,
            direction: entry.direction,
            amountMinor: entry.amountMinor.toString(),
            title: entry.title,
            note: entry.note,
            source: null,
            actor: { id: p.accountId, username: p.account.username, email: actor.email },
            createdAt: entry.createdAt.toISOString(),
          }),
          201,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/overview",
      responses: {
        200: {
          description: "Capability-scoped operator overview",
          content: { "application/json": { schema: operatorOverviewSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      if (!canAccessOperator(p.capabilities))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const denied = requireScope(c, p, "operations:manage");
      if (denied) return denied;
      return c.json(await container.operatorOverview.get(p.capabilities), 200);
    },
  );
  const queryTree = z.object({ root: z.string().uuid().optional() });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/hierarchy/tree",
      request: { query: queryTree },
      responses: {
        200: {
          description: "Hierarchy window",
          content: { "application/json": { schema: treeSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Not permitted",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = hierarchyReadOrAdmin(c, p);
      if (denied) return denied;
      const root = c.req.valid("query").root ?? p.accountId;
      const admin =
        hasCapability(p.capabilities, "hierarchy.manage") &&
        (p.kind === "user_session" || p.scopes.has("hierarchy:admin"));
      try {
        return c.json(await container.hierarchy.tree(p.accountId, root, admin), 200);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "Request failed", code: "forbidden" },
          403,
        );
      }
    },
  );
  const searchQuery = z.object({
    q: z.string().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/hierarchy/search",
      request: { query: searchQuery },
      responses: {
        200: {
          description: "Matching accounts",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(
                  z.object({
                    id: z.string(),
                    username: z.string(),
                    displayName: z.string().nullable(),
                  }),
                ),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = hierarchyReadOrAdmin(c, p);
      if (denied) return denied;
      const q = c.req.valid("query");
      const admin =
        hasCapability(p.capabilities, "hierarchy.manage") &&
        (p.kind === "user_session" || p.scopes.has("hierarchy:admin"));
      const items = await container.hierarchy.search(p.accountId, q.q, admin, q.limit);
      return c.json({ items }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/hierarchy/children/{parentId}",
      request: {
        params: z.object({ parentId: z.string().uuid() }),
        query: z.object({ cursor: z.string().uuid().optional() }),
      },
      responses: {
        200: {
          description: "One child batch",
          content: { "application/json": { schema: childrenSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Not permitted",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = hierarchyReadOrAdmin(c, p);
      if (denied) return denied;
      const admin =
        hasCapability(p.capabilities, "hierarchy.manage") &&
        (p.kind === "user_session" || p.scopes.has("hierarchy:admin"));
      try {
        return c.json(
          await container.hierarchy.children(
            p.accountId,
            c.req.valid("param").parentId,
            admin,
            c.req.valid("query").cursor,
          ),
          200,
        );
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "Request failed", code: "forbidden" },
          403,
        );
      }
    },
  );
  app.openapi(
    createRoute({
      method: "put",
      path: "/api/operator/hierarchy/{accountId}/parent",
      request: {
        params: z.object({ accountId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ parent_account_id: z.string().uuid() }).strict(),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Parent assignment",
          content: { "application/json": { schema: reassignmentSchema } },
        },
        400: {
          description: "Invalid or cyclic relationship",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "hierarchy:admin");
      if (denied) return denied;
      if (!hasCapability(p.capabilities, "hierarchy.manage"))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      try {
        const result = await container.referralGraphService.reassignParent(
          c.req.valid("param").accountId,
          c.req.valid("json").parent_account_id,
          p.accountId,
        );
        return c.json(result, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const operatorKeyBody = z
    .object({
      name: z.string().min(1).max(100),
      scopes: z.array(apiScopeSchema).max(20).default([]),
      expires_at: z.string().datetime().nullable().optional(),
    })
    .strict();
  const keyMetadataSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    key_prefix: z.string(),
    scopes: z.array(z.string()),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
    expires_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
  });
  const userKeyBody = z
    .object({
      name: z.string().min(1).max(100),
      scopes: z.array(apiScopeSchema).max(20).default([]),
      expires_at: z.string().datetime().nullable().optional(),
    })
    .strict();
  const userKeyResult = z.object({
    id: z.string().uuid(),
    secret: z.string(),
    name: z.string(),
    scopes: z.array(z.string()),
  });
  const operatorKeyResult = userKeyResult.extend({
    key_prefix: z.string(),
    created_at: z.string(),
    expires_at: z.string().nullable(),
  });
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/api-keys",
      request: { body: { content: { "application/json": { schema: userKeyBody } } } },
      responses: {
        201: {
          description: "New personal API key; the secret is shown once",
          content: { "application/json": { schema: userKeyResult } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        400: {
          description: "Invalid key request",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      const body = c.req.valid("json");
      const unsupported = body.scopes.find((scope) => !grantableScopes(p).has(scope));
      if (unsupported)
        return c.json(
          { error: "This account cannot grant that API key scope", code: "insufficient_scope" },
          403,
        );
      if (body.expires_at && new Date(body.expires_at) <= new Date())
        return c.json({ error: "Expiry must be in the future", code: "invalid_request" }, 400);
      try {
        return c.json(
          await container.apiKeys.create({
            accountId: p.accountId,
            name: body.name,
            scopes: body.scopes,
            createdBy: p.accountId,
            expiresAt: body.expires_at ? new Date(body.expires_at) : null,
          }),
          201,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/api-keys",
      responses: {
        200: {
          description: "Personal API key metadata",
          content: {
            "application/json": { schema: z.object({ items: z.array(keyMetadataSchema) }) },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      const items = await container.apiKeys.list(p.accountId);
      return c.json(
        {
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            key_prefix: item.keyPrefix,
            scopes: item.scopes,
            created_at: item.createdAt.toISOString(),
            last_used_at: item.lastUsedAt?.toISOString() ?? null,
            expires_at: item.expiresAt?.toISOString() ?? null,
            revoked_at: item.revokedAt?.toISOString() ?? null,
          })),
        },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/api-keys/{id}/revoke",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        204: { description: "Key revoked" },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Key not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      const changed = await container.apiKeys.revoke(c.req.valid("param").id, p.accountId);
      if (!changed) return c.json({ error: "API key not found", code: "not_found" }, 404);
      return c.body(null, 204);
    },
  );
  const operatorKeyParams = z.object({ accountId: z.string().uuid() });
  const operatorKeyIdParams = operatorKeyParams.extend({ id: z.string().uuid() });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts/{accountId}/api-keys",
      request: { params: operatorKeyParams },
      responses: {
        200: {
          description: "Safe API-key metadata for the selected account",
          content: {
            "application/json": { schema: operatorApiKeyListSchema },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "API-key administration required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "api_keys.manage", "api_keys:manage");
      if (denied) return denied;
      try {
        const result = await container.operatorApiKeys.list(
          p.accountId,
          c.req.valid("param").accountId,
        );
        return c.json(
          {
            manageable_scopes: result.manageableScopes,
            items: result.items.map((item) => ({
              id: item.id,
              name: item.name,
              key_prefix: item.keyPrefix,
              scopes: item.scopes,
              created_at: item.createdAt.toISOString(),
              last_used_at: item.lastUsedAt?.toISOString() ?? null,
              expires_at: item.expiresAt?.toISOString() ?? null,
              revoked_at: item.revokedAt?.toISOString() ?? null,
            })),
          },
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/accounts/{accountId}/api-keys",
      request: {
        params: operatorKeyParams,
        body: { content: { "application/json": { schema: operatorKeyBody } } },
      },
      responses: {
        201: {
          description: "New operator-managed key; the secret is shown once",
          content: { "application/json": { schema: operatorKeyResult } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "API-key administration required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "api_keys.manage", "api_keys:manage");
      if (denied) return denied;
      const body = c.req.valid("json");
      try {
        const created = await container.operatorApiKeys.create(
          p.accountId,
          c.req.valid("param").accountId,
          {
            name: body.name,
            scopes: body.scopes,
            expiresAt: body.expires_at ? new Date(body.expires_at) : null,
          },
        );
        return c.json(
          {
            id: created.id,
            secret: created.secret,
            name: created.name,
            scopes: created.scopes,
            key_prefix: created.keyPrefix,
            created_at: created.createdAt.toISOString(),
            expires_at: created.expiresAt?.toISOString() ?? null,
          },
          201,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/accounts/{accountId}/api-keys/{id}/revoke",
      request: { params: operatorKeyIdParams },
      responses: {
        200: {
          description: "API key revocation result",
          content: { "application/json": { schema: z.object({ changed: z.boolean() }) } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "API-key administration required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account or key not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "api_keys.manage", "api_keys:manage");
      if (denied) return denied;
      try {
        const result = await container.operatorApiKeys.revoke(
          p.accountId,
          c.req.valid("param").accountId,
          c.req.valid("param").id,
        );
        return c.json({ changed: result.changed }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  // Listing review reads are approved-only for the public, with a private
  // exception for the requesting account's own review.
  app.get("/api/listings/:listingId/reviews", async (c) => {
    const listingId = c.req.param("listingId");
    if (!z.uuid().safeParse(listingId).success)
      return c.json({ error: "Listing not found", code: "not_found" }, 404);
    const requested = Number(c.req.query("limit") ?? 10);
    const accountId = c.get("principal")?.account.id;
    const page = await container.listingReviews.visible({
      listingId,
      accountId,
      cursor: c.req.query("cursor") || undefined,
      limit: Math.max(1, Math.min(Number.isFinite(requested) ? requested : 10, 50)),
    });
    return c.json({
      items: page.items.map((review) =>
        reviewJson(review, { isMine: review.accountId === accountId }),
      ),
      next_cursor: page.nextCursor,
    });
  });
  app.get("/api/listings/:listingId/reviews/me", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const review = await container.listingReviews.mine(p.account, c.req.param("listingId"));
    return c.json({ item: review ? reviewJson(review) : null });
  });
  app.get("/api/wallet/funding-methods", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const requested = c.req.query("currency")?.trim().toUpperCase();
    if (requested && !/^[A-Z]{3}$/.test(requested))
      return c.json(
        { error: "Currency must be a three-letter code", code: "invalid_request" },
        400,
      );
    const methods = container.providers
      .availableMethodsFor({ country: p.account.country, currency: requested })
      .filter((method): method is NonNullable<typeof method> => method !== null)
      .map((method) => ({
        id: method.provider.name,
        display_name: method.provider.displayName,
        image_url: method.provider.imageUrl,
        description: method.provider.description,
        collection_currencies: method.collectionCurrencies,
        payment_currencies: method.paymentCurrencies,
        default_payment_currency: method.defaultPaymentCurrency ?? null,
      }));
    return c.json({ methods }, 200);
  });
  app.post("/api/payments/:provider/ipn", async (c) => {
    const providerName = c.req.param("provider");
    if (providerName !== "nowpayments")
      return c.json({ error: "Not found", code: "not_found" }, 404);
    let provider: any;
    try {
      provider = container.providers.get(providerName);
    } catch {
      return c.json({ error: "Provider unavailable", code: "provider_unavailable" }, 503);
    }
    const raw = new Uint8Array(await c.req.raw.arrayBuffer());
    if (!provider.verifyIpnSignature?.(raw, c.req.header("x-nowpayments-sig") ?? null))
      return c.json({ error: "Unauthorized", code: "unauthorized" }, 401);
    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(raw).toString("utf8"));
    } catch {
      return c.json({ error: "Invalid notification", code: "invalid_request" }, 400);
    }
    const reference = typeof payload.order_id === "string" ? payload.order_id : null;
    if (!reference) return c.json({ error: "Invalid notification", code: "invalid_request" }, 400);
    const funding = await container.funding.findByProviderReference(providerName, reference);
    if (!funding) return c.json({ error: "Not found", code: "not_found" }, 404);
    if (funding.state === "confirmed" || funding.state === "failed") return c.body(null, 204);
    await container.database.transaction(async () => {
      const locked = await container.funding.findById(funding.id, { forUpdate: true });
      if (
        locked &&
        (locked.state === "awaiting_payment" || locked.state === "verification_pending")
      ) {
        locked.state = "verification_pending";
        await container.funding.save(locked);
      }
    });
    return c.body(null, 202);
  });
  app.put("/api/listings/:listingId/reviews/me", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const body = z
      .object({ rating: z.number().int().min(1).max(5), body: z.string().max(2000).optional() })
      .parse(await c.req.json());
    const review = await container.listingReviews.submit(p.account, c.req.param("listingId"), body);
    return c.json({ item: reviewJson(review, { reviewer: p.account.username, isMine: true }) });
  });
  app.get("/api/operator/reviews", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const denied = requireCapabilityScope(c, p, "reviews.moderate", "reviews:moderate");
    if (denied) return denied;
    const status = z
      .enum(["pending", "approved", "rejected"])
      .optional()
      .parse(c.req.query("status") || undefined);
    const page = await container.listingReviews.operatorQueue(p.account, {
      status,
      cursor: c.req.query("cursor") || undefined,
      limit: 25,
    });
    return c.json({
      items: page.items.map((review) => reviewJson(review)),
      next_cursor: page.nextCursor,
    });
  });
  for (const [verb, status] of [
    ["approve", "approved"],
    ["reject", "rejected"],
  ] as const) {
    app.post(`/api/operator/reviews/:reviewId/${verb}`, async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "reviews.moderate", "reviews:moderate");
      if (denied) return denied;
      const review = await container.listingReviews.moderate(
        p.account,
        c.req.param("reviewId"),
        status,
      );
      return c.json({ item: reviewJson(review) });
    });
  }

  // Compatibility handlers are internal adapters around the same application
  // services. This fallback keeps one authoritative HTTP router while legacy
  // Request/Response contracts remain available to existing clients.
  app.all("/api/*", async (c) => {
    const response = await dispatchLegacyApi(c.req.raw, c.get("principal"));
    return response ?? c.json({ error: "Not found", code: "not_found" }, 404);
  });
  return app;
}
