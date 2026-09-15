import { operatorCapabilitiesForScope } from "@/modules/identity/api/scopes";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import type { ApiPrincipal } from "@/modules/identity/api/principal";
import { z } from "@hono/zod-openapi";
import { publicErrorPayload, validationErrorPayload } from "../error";
import { logDevelopmentError } from "@/infrastructure/development-log";

export type Env = { Variables: { principal: ApiPrincipal | null } };
export const errorSchema = z.object({ error: z.string(), code: z.string().optional() });
export const nodeSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  depth: z.number(),
  directChildCount: z.number(),
  hasChildren: z.boolean(),
  hasMoreChildren: z.boolean(),
  nextChildCursor: z.string().nullable(),
});
export const parentSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  canNavigate: z.boolean(),
});
export const treeSchema = z.object({
  root: z.string(),
  windowDepth: z.number(),
  childLimit: z.number(),
  parent: parentSchema.nullable(),
  nodes: z.array(nodeSchema),
  edges: z.array(z.object({ parent: z.string(), child: z.string() })),
});
export const childrenSchema = z.object({
  parentId: z.string(),
  items: z.array(nodeSchema),
  nextCursor: z.string().nullable(),
});
export const reassignmentSchema = z.object({
  childAccountId: z.string(),
  parentAccountId: z.string(),
  previousParentAccountId: z.string().nullable(),
  changed: z.boolean(),
});
export const accountAccessSchema = z.object({
  accountId: z.string().uuid(),
  capabilities: z.array(z.string()),
  canAccessOperator: z.boolean(),
});
export const operatorOverviewSchema = z.object({
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
export const operatorAccountSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.string(),
  directReferralCount: z.number().int().nonnegative(),
});
export const operatorAccountDetailSchema = operatorAccountSummarySchema.extend({
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
export const capabilityAssignmentSchema = z.object({
  capability: z.string(),
  grantedAt: z.string(),
});
export const capabilityAdministrationSchema = z.object({
  accountId: z.string().uuid(),
  assignments: z.array(capabilityAssignmentSchema),
  manageableCapabilities: z.array(z.string()),
  isSelf: z.boolean(),
});
export const operatorApiKeyMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key_prefix: z.string(),
  scopes: z.array(z.string()),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export const operatorApiKeyListSchema = z.object({
  items: z.array(operatorApiKeyMetadataSchema),
  manageable_scopes: z.array(z.string()),
});
export const fundingStateSchema = z.enum([
  "initialization_pending",
  "initializing",
  "awaiting_payment",
  "verification_pending",
  "confirmed",
  "failed",
  "blocked",
  "expired",
  "reconciliation_pending",
]);
export const operatorFundingWalletCreditSchema = z.object({
  id: z.string().uuid(),
  amountMinor: z.string(),
  currency: z.string(),
  state: z.enum(["pending", "available"]),
  createdAt: z.string(),
  availableAt: z.string().nullable(),
});
export const operatorFundingSummarySchema = z.object({
  id: z.string().uuid(),
  account: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  provider: z.string(),
  providerReference: z.string(),
  providerTransactionId: z.string().nullable(),
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
export const operatorFundingDetailSchema = operatorFundingSummarySchema.extend({
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
  providerInitialization: z
    .object({
      authorizationUrl: z.string().nullable(),
      providerAccountId: z.string().optional(),
      providerAccountSnapshot: z.unknown().optional(),
    })
    .nullable(),
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
      proof: z
        .object({
          provider: z.string(),
          container: z.string(),
          key: z.string(),
          originalFilename: z.string().nullable(),
          mimeType: z.string(),
          byteSize: z.string(),
        })
        .nullable(),
      customerNote: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
});
export const operatorDistributionSummarySchema = z.object({
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
export const operatorDistributionDetailSchema = operatorDistributionSummarySchema.extend({
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
export const operatorEarningsEntrySchema = z.object({
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
export const operatorWithdrawalStateSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "failed",
]);
export const operatorWithdrawalAttentionSchema = z.enum([
  "review",
  "payout",
  "reconciliation",
  "retry",
  "retry_wait",
  "none",
]);
export const operatorWithdrawalSchema = z.object({
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
export const operatorWithdrawalDetailSchema = operatorWithdrawalSchema.extend({
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
export const operatorTreasuryEntrySchema = z.object({
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
export const operatorTreasurySummarySchema = z.object({
  balanceMinor: z.string(),
  creditsMinor: z.string(),
  debitsMinor: z.string(),
  currency: z.literal("USD"),
});
export const blogPostSchema = z.object({
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
export const blogPageSchema = z.object({
  items: z.array(blogPostSchema),
  nextCursor: z.string().nullable(),
  limit: z.number().int(),
});
export function principal(c: any) {
  return c.get("principal") as ApiPrincipal | null;
}
export function requirePrincipal(c: any) {
  const p = principal(c);
  if (!p) {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized", code: "unauthorized" }, 401);
  }
  return p;
}
export function requireScope(c: any, p: ApiPrincipal, scope: string) {
  if (p.kind === "api_key" && !p.scopes.has(scope)) {
    return c.json({ error: "Forbidden", code: "insufficient_scope" }, 403);
  }
  return null;
}
export function requireCapabilityScope(
  c: any,
  p: ApiPrincipal,
  capability: Capability,
  scope: string,
) {
  if (!hasCapability(p.capabilities, capability))
    return c.json({ error: "Forbidden", code: "forbidden" }, 403);
  return requireScope(c, p, scope);
}
export function requireSessionCapability(c: any, p: ApiPrincipal, capability: Capability) {
  if (p.kind !== "user_session")
    return c.json({ error: "A browser session is required.", code: "session_required" }, 403);
  if (!hasCapability(p.capabilities, capability))
    return c.json({ error: "Forbidden", code: "forbidden" }, 403);
  return null;
}
export function reviewJson(review: any, options: { reviewer?: string; isMine?: boolean } = {}) {
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
export function blogJson(post: any) {
  if (!post) return null;
  return {
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}
export function hierarchyReadOrAdmin(c: any, p: ApiPrincipal) {
  if (p.kind === "api_key" && p.scopes.has("hierarchy:admin")) return null;
  return requireScope(c, p, "hierarchy:read");
}
export function grantableScopes(p: ApiPrincipal): Set<string> {
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
export function domainError(c: any, error: unknown) {
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
export function jsonSafe(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  );
}
