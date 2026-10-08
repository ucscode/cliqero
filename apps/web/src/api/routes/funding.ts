import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";
import { crudMaxRows } from "@/config/crud";
import { projectFundingStatus } from "@/api/compat/wallet/fund/status";
import {
  operatorFundingDetailSchema,
  operatorFundingSummarySchema,
  fundingStateSchema,
} from "./funding-operations/contracts";
import { fundingDetailSchema, fundingStatusSchema } from "@/api/compat/wallet/fund/contracts";
import { domainError } from "../shared/error";
import { errorSchema } from "../shared/schemas";
import { PublicApplicationError } from "@/kernel/errors";
import { publicErrorPayload } from "@/api/error";
import { resourceDeleteSchema } from "@/api/shared/resource-delete";
import {
  requireCapabilityScope,
  requirePrincipal,
  requireScope,
  type Env,
} from "../shared/context";

const accountSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.string().nullable(),
});
const fundingStatusResourceSchema = fundingStatusSchema.extend({
  origin: z.enum(["provider", "administrative"]),
  provider: z.string().nullable(),
  provider_display_name: z.string().nullable(),
  funding_reference: z.string().nullable(),
  customer_action: z.string().nullable(),
  account: accountSchema.nullable(),
  operator_details: operatorFundingSummarySchema.nullable(),
  reversal: fundingStatusSchema.shape.reversal,
});
const fundingDetailResourceSchema = fundingDetailSchema.extend({
  origin: z.enum(["provider", "administrative"]),
  provider: z.string().nullable(),
  provider_display_name: z.string().nullable(),
  customer_action: z.string().nullable(),
  funding_reference: z.string().nullable(),
  provider_transaction_id: z.string().nullable(),
  conversion: fundingDetailSchema.shape.conversion.nullable(),
  provider_account_id: z.string().nullable(),
  provider_account_snapshot: fundingDetailSchema.shape.provider_account_snapshot.nullable(),
  authorization_url: z.string().nullable(),
  payment_address: z.string().nullable(),
  payment_amount: z.string().nullable(),
  payment_currency: z.string().nullable(),
  asset: z.string().nullable(),
  network: z.string().nullable(),
  instructions: z.string().nullable(),
  expires_at: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  verification: fundingDetailSchema.shape.verification.nullable(),
  confirmed_at: z.string().nullable(),
  wallet_credit_state: z.string().nullable(),
  evidence: fundingDetailSchema.shape.evidence.nullable(),
  account: accountSchema.nullable(),
  operator_details: operatorFundingDetailSchema.nullable(),
  reversal: fundingDetailSchema.shape.reversal,
});
const ownerQuery = z.object({
  state: fundingStateSchema.optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  active: z.coerce.boolean().default(false),
});
const operatorQuery = z.object({
  search: z.string().max(100).optional(),
  state: fundingStateSchema.optional(),
  provider: z
    .string()
    .regex(/^[a-z0-9_-]{1,50}$/)
    .optional(),
  sort: z.enum(["created", "amount"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(crudMaxRows()).default(crudMaxRows()),
});
const fundingQuery = z.object({
  state: fundingStateSchema.optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(crudMaxRows()).default(50),
  active: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  provider: z
    .string()
    .regex(/^[a-z0-9_-]{1,50}$/)
    .optional(),
  sort: z.enum(["created", "amount"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
});
const providerFundingSchema = z
  .object({
    origin: z.literal("provider").optional(),
    amount_minor: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .max(30),
    provider: z.string().min(1).max(50),
    payment_currency: z.string().min(1).max(12).optional(),
    bank_account_id: z.string().min(1).max(200).optional(),
  })
  .strict();
const administrativeFundingSchema = z
  .object({
    origin: z.literal("administrative"),
    account_id: z.uuid(),
    amount_minor: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .max(30),
    state: z.enum(["confirmed", "failed", "blocked", "cancelled"]),
    reason: z.string().trim().min(1).max(1000),
    reference: z.string().trim().max(200).nullable().optional(),
  })
  .strict();
const createFundingSchema = z.union([providerFundingSchema, administrativeFundingSchema]);
const administrativeFundingUpdateSchema = z
  .object({
    amount_minor: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .max(30),
    state: z.enum(["confirmed", "failed", "blocked", "cancelled"]),
    reason: z.string().trim().min(1).max(1000),
    reference: z.string().trim().max(200).nullable().optional(),
  })
  .strict();
function hasFinanceRead(p: {
  kind: string;
  capabilities: readonly string[];
  scopes?: ReadonlySet<string>;
}) {
  return (
    hasCapability(p.capabilities as never, "finance.read") &&
    (p.kind !== "api_key" || p.scopes?.has("payments:read") === true)
  );
}

export function registerFundingRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/funding-transactions",
      tags: ["Funding Transactions"],
      summary: "List funding transactions",
      description:
        "Returns the caller's own funding transactions, or a bounded administrative view for finance-authorized operators.",
      request: { query: fundingQuery },
      responses: {
        200: {
          description: "Funding transaction page",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(fundingStatusResourceSchema),
                next_cursor: z.string().nullable(),
              }),
            },
          },
        },
        400: {
          description: "Invalid filters or cursor",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Funding read permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      try {
        if (hasFinanceRead(p)) {
          const denied = requireCapabilityScope(c, p, "finance.read", "payments:read");
          if (denied) return denied;
          const query = operatorQuery.parse(c.req.query());
          const page = await container.operatorFunding.list(query);
          return c.json(
            {
              items: await Promise.all(
                page.items.map(async (item) => ({
                  id: item.id,
                  origin: item.origin,
                  provider: item.provider,
                  provider_display_name: item.provider
                    ? container.providers.displayName(item.provider)
                    : null,
                  customer_action: null,
                  funding_reference:
                    item.providerReference ?? item.administrativeReference ?? item.id,
                  provider_transaction_id: item.providerTransactionId,
                  state: item.state,
                  amount_minor: item.canonicalAmountMinor,
                  currency: item.canonicalCurrency,
                  collection_amount_minor: item.collectionAmountMinor,
                  collection_currency: item.collectionCurrency,
                  created_at: item.createdAt,
                  confirmed_at: item.confirmedAt,
                  account: item.account,
                  operator_details: {
                    ...item,
                    reversal: projectOperatorReversalSummary(
                      await container.fundingReversals.summary(item.id),
                    ),
                  },
                  reversal: projectReversalSummary(
                    await container.fundingReversals.summary(item.id),
                  ),
                })),
              ),
              next_cursor: page.nextCursor,
            },
            200,
          );
        }
        const denied = requireScope(c, p, "wallet:read");
        if (denied) return denied;
        const query = ownerQuery.parse(c.req.query());
        const page = await container.operatorFunding.list({
          accountId: p.accountId,
          state: query.state,
          cursor: query.cursor,
          limit: query.limit,
          active: query.active,
          sort: "created",
          direction: "desc",
        });
        return c.json(
          {
            items: await Promise.all(
              page.items.map(async (item) => ({
                id: item.id,
                origin: item.origin,
                provider: item.provider,
                provider_display_name: item.provider
                  ? container.providers.displayName(item.provider)
                  : null,
                customer_action: item.provider
                  ? container.providers.customerActionLabel(item.provider)
                  : null,
                funding_reference: item.providerReference ?? item.administrativeReference,
                provider_transaction_id: item.providerTransactionId,
                state: item.state,
                amount_minor: item.canonicalAmountMinor,
                currency: item.canonicalCurrency,
                collection_amount_minor: item.collectionAmountMinor,
                collection_currency: item.collectionCurrency,
                created_at: item.createdAt,
                confirmed_at: item.confirmedAt,
                account: null,
                operator_details: null,
                reversal: projectReversalSummary(await container.fundingReversals.summary(item.id)),
              })),
            ),
            next_cursor: page.nextCursor,
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
      path: "/api/funding-transactions",
      tags: ["Funding Transactions"],
      summary: "Create a funding transaction",
      description:
        "Creates a provider funding attempt for the authenticated account or an administrative funding record for a finance operator. Idempotency-Key is required for both intents; reusing it with different intent conflicts.",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: { content: { "application/json": { schema: createFundingSchema } } },
      },
      responses: {
        201: {
          description: "Funding transaction created",
          content: {
            "application/json": {
              schema: fundingDetailResourceSchema,
            },
          },
        },
        400: {
          description: "Invalid funding request",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Funding permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Funding request conflicts with existing state",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      try {
        const body = c.req.valid("json");
        if (body.origin === "administrative") {
          const manageDenied = requireCapabilityScope(c, p, "finance.manage", "payments:manage");
          if (manageDenied) return manageDenied;
          const created = await container.operatorFunding.createAdministrative(p.accountId, {
            accountId: body.account_id,
            amountMinor: body.amount_minor,
            state: body.state,
            reason: body.reason,
            reference: body.reference,
            idempotencyKey: c.req.header("idempotency-key")!,
          });
          const detail = await container.operatorFunding.get(created.id);
          return c.json(administrativeDetailProjection(detail, true), 201);
        }
        const denied = requireScope(c, p, "wallet:fund");
        if (denied) return denied;
        const funding = await container.fundingService.create({
          accountId: p.accountId,
          amountMinor: BigInt(body.amount_minor),
          providerName: body.provider,
          paymentCurrency: body.payment_currency,
          fundingOptionId: body.bank_account_id,
          idempotencyKey: c.req.header("idempotency-key")!,
        });
        return c.json(
          {
            origin: "provider" as const,
            ...(await projectFundingStatus(container, p.accountId, funding)),
            account: null,
            operator_details: null,
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
      method: "patch",
      path: "/api/funding-transactions/{fundingId}",
      tags: ["Funding Transactions"],
      summary: "Update administrative funding",
      description:
        "Updates supported administrative funding fields. Provider-origin funding is immutable through this operation.",
      request: {
        params: z.object({ fundingId: z.uuid() }),
        body: { content: { "application/json": { schema: administrativeFundingUpdateSchema } } },
      },
      responses: {
        200: {
          description: "Administrative funding updated",
          content: { "application/json": { schema: fundingDetailResourceSchema } },
        },
        400: {
          description: "Invalid administrative funding update",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Funding management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Funding transaction not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Provider funding is not administratively mutable",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.manage", "payments:manage");
      if (denied) return denied;
      try {
        const { fundingId } = c.req.valid("param");
        const current = await container.operatorFunding.get(fundingId);
        if (current.origin !== "administrative")
          throw new PublicApplicationError(
            "Provider funding is not administratively mutable.",
            "provider_funding_immutable",
            409,
          );
        const body = c.req.valid("json");
        await container.operatorFunding.updateAdministrative(p.accountId, fundingId, {
          amountMinor: body.amount_minor,
          state: body.state,
          reason: body.reason,
          reference: body.reference,
        });
        return c.json(
          administrativeDetailProjection(await container.operatorFunding.get(fundingId), true),
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
      path: "/api/funding-transactions",
      tags: ["Funding Transactions"],
      summary: "Delete eligible funding transactions",
      description:
        "Deletes selected administrative funding when permitted; provider funding cleanup remains root-only maintenance.",
      request: { body: { content: { "application/json": { schema: resourceDeleteSchema() } } } },
      responses: {
        200: {
          description: "Per-record funding deletion outcomes",
          content: {
            "application/json": {
              schema: z.object({
                results: z.array(
                  z.object({
                    id: z.uuid(),
                    deleted: z.boolean(),
                    error: z.string().nullable(),
                    error_code: z.string().optional(),
                    status: z.number().int().optional(),
                  }),
                ),
              }),
            },
          },
        },
        400: {
          description: "Invalid deletion request",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Funding management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const scopeDenied = requireScope(c, p, "payments:manage");
      if (scopeDenied) return scopeDenied;
      if (
        !hasCapability(p.capabilities as never, "finance.manage") &&
        !hasCapability(p.capabilities as never, "system.root")
      )
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const { ids } = c.req.valid("json");
      const results = [];
      for (const id of ids) {
        try {
          const funding = await container.operatorFunding.get(id);
          const authorized =
            funding.origin === "administrative"
              ? hasCapability(p.capabilities as never, "finance.manage")
              : hasCapability(p.capabilities as never, "system.root");
          if (!authorized) throw new Error("Funding could not be deleted.");
          await container.operatorFunding.deleteByOperator(p.accountId, id);
          results.push({ id, deleted: true, error: null });
        } catch (error) {
          const publicError = publicErrorPayload(error);
          const debtConflict =
            publicError?.payload.code === "funding_delete_debt_dependency_conflict";
          results.push({
            id,
            deleted: false,
            error: debtConflict ? publicError.payload.error : "Funding could not be deleted.",
            ...(debtConflict
              ? { error_code: publicError.payload.code, status: publicError.status }
              : {}),
          });
        }
      }
      return c.json({ results }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/funding-transactions/{fundingId}",
      tags: ["Funding Transactions"],
      summary: "Get a funding transaction",
      description:
        "Returns the caller-owned funding detail, or administrative detail for a finance-authorized operator.",
      request: { params: z.object({ fundingId: z.uuid() }) },
      responses: {
        200: {
          description: "Funding transaction detail",
          content: { "application/json": { schema: fundingDetailResourceSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Funding read permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Funding transaction not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const id = c.req.valid("param").fundingId;
      try {
        if (hasFinanceRead(p)) {
          const denied = requireCapabilityScope(c, p, "finance.read", "payments:read");
          if (denied) return denied;
          const admin = await container.operatorFunding.get(id);
          if (admin.origin === "administrative")
            return c.json(administrativeDetailProjection(admin, true), 200);
          const funding = await container.funding.findById(id);
          if (!funding) return c.json({ error: "Funding not found", code: "not_found" }, 404);
          return c.json(
            {
              origin: "provider" as const,
              ...(await projectFundingStatus(container, funding.accountId, funding)),
              account: admin.account,
              operator_details: {
                ...admin,
                reversal: projectOperatorReversalSummary(
                  await container.fundingReversals.summary(id),
                ),
              },
            },
            200,
          );
        }
        const denied = requireScope(c, p, "wallet:read");
        if (denied) return denied;
        const resource = await container.operatorFunding.get(id);
        if (resource.account.id !== p.accountId)
          return c.json({ error: "Funding not found", code: "not_found" }, 404);
        if (resource.origin === "administrative")
          return c.json(administrativeDetailProjection(resource, false), 200);
        const funding = await container.funding.findById(id);
        if (!funding || funding.accountId !== p.accountId)
          return c.json({ error: "Funding not found", code: "not_found" }, 404);
        return c.json(
          {
            origin: "provider" as const,
            ...(await projectFundingStatus(container, p.accountId, funding)),
            account: null,
            operator_details: null,
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
      method: "get",
      path: "/api/funding-options",
      tags: ["Funding Options"],
      summary: "Prepare funding options",
      description:
        "Projects provider-available funding options and persisted-rate inputs for a proposed funding amount.",
      request: {
        query: z
          .object({
            amount_minor: z.string().regex(/^[1-9][0-9]*$/),
            provider: z.string().min(1),
            payment_currency: z.string().min(1).optional(),
            bank_account_id: z.string().min(1).optional(),
          })
          .strict(),
      },
      responses: {
        200: {
          description: "Prepared funding options",
          content: {
            "application/json": {
              schema: z.object({
                provider: z.string(),
                amount_minor: z.string(),
                currency: z.string(),
                collection_amount_minor: z.string(),
                collection_currency: z.string(),
                payment_currency: z.string().nullable(),
                funding_options: z.array(
                  z.object({
                    id: z.string(),
                    collection_currency: z.string(),
                    fields: z.array(
                      z.object({
                        key: z.string(),
                        label: z.string(),
                        value: z.string(),
                        copyable: z.boolean().optional(),
                      }),
                    ),
                  }),
                ),
                conversion: z
                  .object({
                    from_currency: z.string(),
                    to_currency: z.string(),
                    rate: z.string(),
                    observed_at: z.string(),
                  })
                  .nullable(),
              }),
            },
          },
        },
        400: {
          description: "Invalid funding option request",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Funding permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Funding options unavailable for the account",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "wallet:fund");
      if (denied) return denied;
      try {
        const q = c.req.valid("query");
        const prepared = await container.fundingService.prepare({
          accountId: p.accountId,
          amountMinor: BigInt(q.amount_minor),
          providerName: q.provider,
          paymentCurrency: q.payment_currency,
          fundingOptionId: q.bank_account_id,
        });
        return c.json(
          {
            provider: prepared.provider,
            amount_minor: prepared.canonicalAmount.minorAmount.toString(),
            currency: prepared.canonicalAmount.currency,
            collection_amount_minor: prepared.collectionAmount.minorAmount.toString(),
            collection_currency: prepared.collectionAmount.currency,
            payment_currency: prepared.paymentCurrency?.toUpperCase() ?? null,
            funding_options: (prepared.fundingOptions ?? []).map((option) => ({
              id: option.id,
              collection_currency: option.collectionCurrency,
              fields: [...option.fields],
            })),
            conversion: prepared.conversionSnapshot
              ? {
                  from_currency: prepared.conversionSnapshot.fromCurrency,
                  to_currency: prepared.conversionSnapshot.toCurrency,
                  rate: prepared.conversionSnapshot.rate,
                  observed_at: prepared.conversionSnapshot.observedAt.toISOString(),
                }
              : null,
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
      method: "get",
      path: "/api/funding-methods",
      tags: ["Funding Methods"],
      summary: "List available funding methods",
      description:
        "Lists configured funding providers available for the authenticated account's country.",
      responses: {
        200: {
          description: "Available funding methods",
          content: {
            "application/json": {
              schema: z.object({
                methods: z.array(
                  z.object({
                    id: z.string(),
                    display_name: z.string(),
                    image_url: z.string(),
                    description: z.string(),
                    test_only: z.enum(["development", "test"]).nullable(),
                    collection_currencies: z.array(z.string()),
                    payment_currencies: z.array(
                      z.object({
                        code: z.string(),
                        label: z.string().optional(),
                        asset: z.string().optional(),
                        network: z.string().optional(),
                      }),
                    ),
                    customer_action: z.string().nullable(),
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
        403: {
          description: "Funding permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Account country is required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "wallet:fund");
      if (denied) return denied;
      if (!p.account.country)
        return c.json(
          { error: "Account country is required for funding", code: "country_required" },
          409,
        );
      const methods = container.providers
        .availableMethodsFor({ country: p.account.country })
        .map((method) => ({
          id: method.provider.name,
          display_name: method.provider.displayName,
          image_url: method.provider.imageUrl,
          description: method.provider.description,
          test_only: method.provider.environmentOnly ?? null,
          collection_currencies: method.collectionCurrencies,
          payment_currencies: [...method.paymentCurrencies],
          customer_action: method.customerActionLabel,
        }));
      return c.json({ methods }, 200);
    },
  );
}

function administrativeDetailProjection(
  funding: Awaited<ReturnType<ApplicationContainer["operatorFunding"]["get"]>>,
  operator: boolean,
) {
  return {
    id: funding.id,
    origin: "administrative" as const,
    state: funding.state,
    provider: null,
    provider_display_name: null,
    customer_action: null,
    funding_reference: funding.administrativeReference,
    provider_transaction_id: null,
    amount_minor: funding.canonicalAmountMinor,
    currency: funding.canonicalCurrency,
    collection_amount_minor: funding.collectionAmountMinor,
    collection_currency: funding.collectionCurrency,
    conversion: null,
    provider_account_id: null,
    provider_account_snapshot: null,
    authorization_url: null,
    payment_address: null,
    payment_amount: null,
    payment_currency: null,
    asset: null,
    network: null,
    instructions: null,
    expires_at: null,
    error_code: null,
    error_message: null,
    verification: null,
    confirmed_at: funding.confirmedAt,
    wallet_credit_state: funding.walletCredit?.state ?? null,
    reversal: { state: "none" as const, reversed_amount_minor: "0", remaining_amount_minor: "0" },
    evidence: null,
    created_at: funding.createdAt,
    account: operator ? funding.account : null,
    operator_details: operator
      ? {
          ...funding,
          reversal: { state: "none" as const, reversedAmountMinor: "0", remainingAmountMinor: "0" },
        }
      : null,
  };
}

function projectReversalSummary(
  value: Awaited<ReturnType<ApplicationContainer["fundingReversals"]["summary"]>>,
) {
  return {
    state: value.state,
    reversed_amount_minor: value.reversedAmountMinor,
    remaining_amount_minor: value.remainingAmountMinor,
  };
}

function projectOperatorReversalSummary(
  value: Awaited<ReturnType<ApplicationContainer["fundingReversals"]["summary"]>>,
) {
  return {
    state: value.state,
    reversedAmountMinor: value.reversedAmountMinor,
    remainingAmountMinor: value.remainingAmountMinor,
  };
}
