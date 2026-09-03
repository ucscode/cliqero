import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import type { ApiPrincipal } from "@/modules/identity/api-principal";
import { apiScopeSchema } from "@/modules/identity/api-scopes";
import { dispatchLegacyApi, legacyApiPaths } from "./legacy-dispatch";
import { newId } from "@/kernel/ids";

type Env = { Variables: { principal: ApiPrincipal | null } };
const errorSchema = z.object({ error: z.string(), code: z.string().optional() });
const nodeSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string().nullable(),
  depth: z.number(),
  directChildCount: z.number(),
  hasChildren: z.boolean(),
  hasMoreChildren: z.boolean(),
  nextChildCursor: z.string().nullable(),
});
const parentSchema = z.object({
  id: z.string(),
  handle: z.string(),
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
  roles: z.array(z.string()),
  canAccessOperator: z.boolean(),
});
const operatorOverviewSchema = z.object({
  role: z.enum(["operator", "catalogue_manager"]),
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
  handle: z.string(),
  displayName: z.string().nullable(),
  email: z.string(),
  country: z.string().nullable(),
  roles: z.array(z.string()),
  createdAt: z.string(),
  directReferralCount: z.number().int().nonnegative(),
});
const operatorAccountDetailSchema = operatorAccountSummarySchema.extend({
  parent: z
    .object({ id: z.string().uuid(), handle: z.string(), displayName: z.string().nullable() })
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
  account: z.object({ id: z.string().uuid(), handle: z.string(), email: z.string() }),
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
});
const operatorDistributionSummarySchema = z.object({
  id: z.string().uuid(),
  purchaseId: z.string().uuid(),
  listingId: z.string().uuid(),
  listingTitle: z.string(),
  buyer: z.object({ id: z.string().uuid(), handle: z.string(), email: z.string() }),
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
    linkId: z.string().uuid().nullable(),
    referrer: z.object({ id: z.string().uuid(), handle: z.string(), email: z.string() }).nullable(),
  }),
  policySnapshot: z.unknown(),
  allocations: z.array(
    z.object({
      id: z.string().uuid(),
      account: z.object({ id: z.string().uuid(), handle: z.string(), email: z.string() }),
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
  account: z.object({ id: z.string().uuid(), handle: z.string(), email: z.string() }),
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
  account: z.object({ id: z.string().uuid(), handle: z.string(), email: z.string() }),
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
  actor: z.object({ id: z.string().uuid(), handle: z.string(), email: z.string() }).nullable(),
  createdAt: z.string(),
});
const operatorTreasurySummarySchema = z.object({
  balanceMinor: z.string(),
  creditsMinor: z.string(),
  debitsMinor: z.string(),
  currency: z.literal("USD"),
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
function requireOperatorScope(c: any, p: ApiPrincipal, scope: string) {
  if (!p.roles.includes("operator")) return c.json({ error: "Forbidden", code: "forbidden" }, 403);
  return requireScope(c, p, scope);
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
  if (p.roles.includes("catalogue_manager") || p.roles.includes("operator"))
    allowed.add("catalogue:manage");
  if (p.roles.includes("operator"))
    for (const scope of [
      "hierarchy:admin",
      "withdrawals:manage",
      "treasury:read",
      "treasury:manage",
      "operations:manage",
    ])
      allowed.add(scope);
  return allowed;
}
function domainError(c: any, error: unknown) {
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

export function createApiApp(container: ApplicationContainer) {
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
      },
    }),
    (c) => {
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
        overview["x-required-api-scope"] =
          "operations:manage (operator) or catalogue:read (catalogue_manager)";
      }
      for (const path of ["/api/operator/accounts", "/api/operator/accounts/{accountId}"]) {
        const operation = document.paths[path]?.get;
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] = "operations:manage (operator)";
        }
      }
      for (const path of ["/api/operator/funding", "/api/operator/funding/{fundingId}"]) {
        const operation = document.paths[path]?.get;
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] = "operations:manage (operator)";
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
          operation["x-required-api-scope"] = "operations:manage (operator)";
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
              operation["x-required-api-scope"] = "withdrawals:manage (operator)";
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
              method === "post" ? "treasury:manage (operator)" : "treasury:read (operator)";
          }
        }
      }
      const access = document.paths["/api/me/access"]?.get;
      if (access) access["x-authentication-mode"] = "account";
      return c.json(document);
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
      const denied = requireOperatorScope(c, p, "operations:manage");
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
      const denied = requireOperatorScope(c, p, "operations:manage");
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
      const denied = requireOperatorScope(c, p, "operations:manage");
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
      const denied = requireOperatorScope(c, p, "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorAccounts.get(c.req.valid("param").accountId), 200);
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
      const denied = requireOperatorScope(c, p, "operations:manage");
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
      const denied = requireOperatorScope(c, p, "operations:manage");
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
      const denied = requireOperatorScope(c, p, "operations:manage");
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
          description: "Current account roles and safe application access flags",
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
          roles: [...p.roles],
          canAccessOperator: p.roles.includes("operator") || p.roles.includes("catalogue_manager"),
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
      const denied = requireOperatorScope(c, p, "withdrawals:manage");
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
      const denied = requireOperatorScope(c, p, "withdrawals:manage");
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
      const denied = requireOperatorScope(c, p, "withdrawals:manage");
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
      const denied = requireOperatorScope(c, p, "withdrawals:manage");
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
        const denied = requireOperatorScope(c, p, "withdrawals:manage");
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
      const denied = requireOperatorScope(c, p, "treasury:read");
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
      const denied = requireOperatorScope(c, p, "treasury:read");
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
      const denied = requireOperatorScope(c, p, "treasury:read");
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
      const denied = requireOperatorScope(c, p, "treasury:manage");
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
        return c.json(
          jsonSafe({
            id: entry.id,
            direction: entry.direction,
            amountMinor: entry.amountMinor.toString(),
            title: entry.title,
            note: entry.note,
            source: null,
            actor: { id: p.accountId, handle: p.account.handle, email: p.account.email },
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
          description: "Role-scoped operator overview",
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
      const role = p.roles.includes("operator")
        ? "operator"
        : p.roles.includes("catalogue_manager")
          ? "catalogue_manager"
          : null;
      if (!role) return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const denied = requireScope(
        c,
        p,
        role === "operator" ? "operations:manage" : "catalogue:read",
      );
      if (denied) return denied;
      return c.json(await container.operatorOverview.get(role), 200);
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
        p.roles.includes("operator") &&
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
                    handle: z.string(),
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
        p.roles.includes("operator") &&
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
        p.roles.includes("operator") &&
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
      if (!p.roles.includes("operator"))
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
  const keyBody = z
    .object({
      name: z.string().min(1).max(100),
      scopes: z.array(apiScopeSchema).max(20).default([]),
      expires_at: z.string().datetime().nullable().optional(),
      account_id: z.string().uuid().optional(),
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
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/api-keys",
      request: { body: { content: { "application/json": { schema: keyBody } } } },
      responses: {
        201: {
          description: "New key (secret shown once)",
          content: {
            "application/json": {
              schema: z.object({
                id: z.string(),
                secret: z.string(),
                name: z.string(),
                scopes: z.array(z.string()),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      if (!p.roles.includes("operator"))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const b = c.req.valid("json");
      const result = await container.apiKeys.create({
        accountId: b.account_id ?? p.accountId,
        name: b.name,
        scopes: b.scopes,
        createdBy: p.accountId,
        expiresAt: b.expires_at ? new Date(b.expires_at) : null,
      });
      return c.json(result, 201);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/api-keys",
      responses: {
        200: {
          description: "API keys",
          content: { "application/json": { schema: z.object({ items: z.array(z.any()) }) } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      if (!p.roles.includes("operator"))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      return c.json({ items: await container.apiKeys.list() }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/api-keys/{id}/revoke",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        204: { description: "Key revoked" },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      if (!p.roles.includes("operator"))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      await container.apiKeys.revoke(c.req.valid("param").id);
      return c.body(null, 204);
    },
  );

  // Compatibility handlers are internal adapters around the same application
  // services. This fallback keeps one authoritative HTTP router while legacy
  // Request/Response contracts remain available to existing clients.
  app.all("/api/*", async (c) => {
    const response = await dispatchLegacyApi(c.req.raw, c.get("principal"));
    return response ?? c.json({ error: "Not found", code: "not_found" }, 404);
  });
  return app;
}
