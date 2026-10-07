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
const fundingStatusWithAdminSchema = fundingStatusSchema.extend({
  account: accountSchema.nullable(),
  administrative: operatorFundingSummarySchema.nullable(),
});
const fundingDetailWithAdminSchema = fundingDetailSchema.extend({
  account: accountSchema.nullable(),
  administrative: operatorFundingDetailSchema.nullable(),
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
const createFundingSchema = z
  .object({
    amount_minor: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .max(30),
    provider: z.string().min(1).max(50),
    payment_currency: z.string().min(1).max(12).optional(),
    bank_account_id: z.string().min(1).max(200).optional(),
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
                items: z.array(fundingStatusWithAdminSchema),
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
              items: page.items.map((item) => ({
                id: item.id,
                provider: item.provider ?? "administrative",
                provider_display_name: item.provider ?? "Administrative funding",
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
                administrative: item,
              })),
              next_cursor: page.nextCursor,
            },
            200,
          );
        }
        const denied = requireScope(c, p, "wallet:read");
        if (denied) return denied;
        const query = ownerQuery.parse(c.req.query());
        const page = await container.funding.findHistoryForAccount?.({
          accountId: p.accountId,
          state: query.state,
          cursor: query.cursor,
          limit: query.limit,
          active: query.active,
        });
        return c.json(
          {
            items: (page?.items ?? []).map((f) => ({
              id: f.id,
              provider: f.providerName,
              provider_display_name:
                f.providerInitialization?.providerDisplayName ??
                container.providers.displayName(f.providerName),
              customer_action: container.providers.customerActionLabel(f.providerName),
              funding_reference: f.providerReference,
              provider_transaction_id: f.providerTransactionId ?? null,
              state: f.state,
              amount_minor: f.canonicalAmount.minorAmount.toString(),
              currency: f.canonicalAmount.currency,
              collection_amount_minor: f.collectionAmount.minorAmount.toString(),
              collection_currency: f.collectionAmount.currency,
              created_at: f.createdAt?.toISOString() ?? null,
              confirmed_at: f.confirmedAt?.toISOString() ?? null,
              account: null,
              administrative: null,
            })),
            next_cursor: page?.nextCursor ?? null,
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
      description: "Creates an idempotent funding attempt using the selected configured provider.",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: { content: { "application/json": { schema: createFundingSchema } } },
      },
      responses: {
        201: {
          description: "Funding transaction created",
          content: {
            "application/json": {
              schema: z.object({
                id: z.uuid(),
                state: fundingStateSchema,
                amount_minor: z.string(),
                currency: z.string(),
                provider: z.string(),
              }),
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
      const denied = requireScope(c, p, "wallet:fund");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
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
            id: funding.id,
            state: funding.state,
            amount_minor: funding.canonicalAmount.minorAmount.toString(),
            currency: funding.canonicalAmount.currency,
            provider: funding.providerName,
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
          content: { "application/json": { schema: fundingDetailWithAdminSchema } },
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
          const funding = await container.funding.findById(id);
          if (!funding) return c.json({ error: "Funding not found", code: "not_found" }, 404);
          return c.json(
            {
              ...(await projectFundingStatus(container, funding.accountId, funding)),
              account: admin.account,
              administrative: admin,
            },
            200,
          );
        }
        const denied = requireScope(c, p, "wallet:read");
        if (denied) return denied;
        const funding = await container.funding.findById(id);
        if (!funding || funding.accountId !== p.accountId)
          return c.json({ error: "Funding not found", code: "not_found" }, 404);
        return c.json(
          {
            ...(await projectFundingStatus(container, p.accountId, funding)),
            account: null,
            administrative: null,
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

  app.get("/api/wallet/funding-methods", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
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
        payment_currencies: method.paymentCurrencies,
        customer_action: method.customerActionLabel,
      }));
    return c.json({ methods }, 200);
  });
}
