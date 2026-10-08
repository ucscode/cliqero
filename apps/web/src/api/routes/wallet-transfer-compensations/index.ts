import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";
import {
  requireCapabilityScope,
  requirePrincipal,
  requireScope,
  type Env,
} from "@/api/shared/context";
import { domainError } from "@/api/shared/error";
import { errorSchema } from "@/api/shared/schemas";
import type { WalletTransferCompensation } from "@/modules/wallet/transfer-compensations";

const item = z.object({
  id: z.uuid(),
  transfer_id: z.uuid(),
  account_id: z.uuid(),
  from_wallet: z.enum(["funding", "earnings"]),
  to_wallet: z.enum(["funding", "earnings"]),
  gross_amount_minor: z.string().regex(/^[1-9]\d*$/),
  fee_minor: z.string().regex(/^\d+$/),
  net_amount_minor: z.string().regex(/^\d+$/),
  currency: z.literal("USD"),
  reason: z.string(),
  recovery: z.object({
    destination_wallet_minor: z.string().regex(/^\d+$/),
    source_wallet_minor: z.string().regex(/^\d+$/),
    fee_refunded_minor: z.string().regex(/^\d+$/),
    debt_minor: z.string().regex(/^\d+$/),
  }),
  created_by: z.uuid(),
  correlation_id: z.uuid(),
  idempotency_key: z.string(),
  created_at: z.string().datetime(),
});

const requestBody = z
  .object({ transfer_id: z.uuid(), reason: z.string().trim().min(1).max(1000) })
  .strict();

const exampleItem = {
  id: "8e4a9b43-78c7-4c11-8f87-1166784e2f65",
  transfer_id: "184c5604-aed6-423e-9d2b-6864c433b8bb",
  account_id: "285c6705-bfe7-434f-ae3c-7975d544c9cc",
  from_wallet: "funding",
  to_wallet: "earnings",
  gross_amount_minor: "1000",
  fee_minor: "50",
  net_amount_minor: "950",
  currency: "USD",
  reason: "Transfer correction",
  recovery: {
    destination_wallet_minor: "950",
    source_wallet_minor: "1000",
    fee_refunded_minor: "50",
    debt_minor: "0",
  },
  created_by: "285c6705-bfe7-434f-ae3c-7975d544c9cc",
  correlation_id: "315d7806-b0f8-4bd0-9e94-cd2ae80d029c",
  idempotency_key: "compensation-request-1",
  created_at: "2026-10-08T12:00:00.000Z",
};

const errorExample = {
  error: "The requested operation could not be completed.",
  code: "financial_conflict",
};
const conflictExamples = {
  idempotencyConflict: {
    summary: "Idempotency key belongs to a different request",
    value: {
      error: "Idempotency key conflicts with a different compensation request.",
      code: "idempotency_conflict",
    },
  },
  alreadyCompensated: {
    summary: "Transfer already has a full compensation",
    value: {
      error: "This wallet transfer has already been compensated.",
      code: "transfer_already_compensated",
    },
  },
  outstandingDebt: {
    summary: "Account debt blocks this operation",
    value: {
      error: "This transfer is unavailable while the account has outstanding debt.",
      code: "account_debt_blocks_operation",
    },
  },
  destinationUnavailable: {
    summary: "Full destination amount is unavailable",
    value: {
      error: "The full destination amount is no longer available.",
      code: "transfer_compensation_insufficient_destination",
    },
  },
  treasuryShortfall: {
    summary: "Treasury cannot refund the original fee",
    value: {
      error: "Treasury cannot safely refund the original transfer fee.",
      code: "transfer_compensation_treasury_shortfall",
    },
  },
};

const ownerFinanceDenied = {
  401: {
    description: "Authentication required",
    content: { "application/json": { schema: errorSchema, example: errorExample } },
  },
  403: {
    description: "Owner wallet scope or finance operator permission required",
    content: { "application/json": { schema: errorSchema, example: errorExample } },
  },
};

export function registerWalletTransferCompensationRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/wallet-transfer-compensations",
      tags: ["Wallet Transfer Compensations"],
      summary: "List wallet transfer compensations",
      description:
        "Lists immutable full-compensation facts. Owners require wallet:read; finance operators may inspect accounts with finance.read and payments:read.",
      request: {
        query: z.object({
          account_id: z.uuid().optional(),
          transfer_id: z.uuid().optional(),
          cursor: z.string().max(512).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
      },
      responses: {
        200: {
          description: "Compensation page",
          content: {
            "application/json": {
              schema: z.object({ items: z.array(item), next_cursor: z.string().nullable() }),
              examples: {
                example: {
                  value: {
                    items: [exampleItem],
                    next_cursor: null,
                  },
                },
              },
            },
          },
        },
        ...ownerFinanceDenied,
        400: {
          description: "Malformed cursor",
          content: { "application/json": { schema: errorSchema, example: errorExample } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const finance =
        hasCapability(principal.capabilities as never, "finance.read") &&
        (principal.kind !== "api_key" || principal.scopes.has("payments:read"));
      const denied = finance
        ? requireCapabilityScope(c, principal, "finance.read", "payments:read")
        : requireScope(c, principal, "wallet:read");
      if (denied) return denied;
      const query = c.req.valid("query");
      if (!finance && query.account_id && query.account_id !== principal.accountId)
        return c.json({ items: [], next_cursor: null }, 200);
      try {
        const page = await container.walletTransferCompensations.list({
          accountId: finance ? query.account_id : principal.accountId,
          transferId: query.transfer_id,
          cursor: query.cursor,
          limit: query.limit,
        });
        return c.json({ items: page.items.map(project), next_cursor: page.nextCursor }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/wallet-transfer-compensations",
      tags: ["Wallet Transfer Compensations"],
      summary: "Compensate a wallet transfer",
      description:
        "Records one immutable full compensation for a completed transfer. It requires the full net destination amount and original fee to remain available; outstanding account debt or an insufficient destination/Treasury balance causes a conflict. Requires finance.manage and API-key scope payments:manage.",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: {
          content: {
            "application/json": {
              schema: requestBody,
              example: {
                transfer_id: exampleItem.transfer_id,
                reason: "Transfer correction",
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Compensation recorded",
          content: {
            "application/json": {
              schema: item,
              examples: {
                example: {
                  value: exampleItem,
                },
              },
            },
          },
        },
        ...ownerFinanceDenied,
        400: {
          description: "Invalid request or Idempotency-Key",
          content: { "application/json": { schema: errorSchema, example: errorExample } },
        },
        404: {
          description: "Transfer not found",
          content: { "application/json": { schema: errorSchema, example: errorExample } },
        },
        409: {
          description:
            "Idempotency conflict, already compensated, outstanding debt, unavailable destination funds, or Treasury fee shortfall",
          content: { "application/json": { schema: errorSchema, examples: conflictExamples } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.manage", "payments:manage");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        const result = await container.walletTransferCompensations.createByOperator({
          actorId: principal.accountId,
          transferId: body.transfer_id,
          reason: body.reason,
          idempotencyKey: c.req.header("idempotency-key")!,
        });
        return c.json(project(result), 201);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/wallet-transfer-compensations/{compensationId}",
      tags: ["Wallet Transfer Compensations"],
      summary: "Get a wallet transfer compensation",
      description:
        "Returns the immutable compensation and its original transfer/recovery facts. Owners require wallet:read; finance operators require finance.read and payments:read.",
      request: { params: z.object({ compensationId: z.uuid() }) },
      responses: {
        200: {
          description: "Wallet transfer compensation",
          content: { "application/json": { schema: item, example: exampleItem } },
        },
        ...ownerFinanceDenied,
        404: {
          description: "Compensation not found",
          content: { "application/json": { schema: errorSchema, example: errorExample } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const finance =
        hasCapability(principal.capabilities as never, "finance.read") &&
        (principal.kind !== "api_key" || principal.scopes.has("payments:read"));
      const denied = finance
        ? requireCapabilityScope(c, principal, "finance.read", "payments:read")
        : requireScope(c, principal, "wallet:read");
      if (denied) return denied;
      try {
        const result = await container.walletTransferCompensations.get(
          c.req.valid("param").compensationId,
        );
        if (!result || (!finance && result.accountId !== principal.accountId))
          return c.json({ error: "Not found", code: "not_found" }, 404);
        return c.json(project(result), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}

function project(value: WalletTransferCompensation) {
  return {
    id: value.id,
    transfer_id: value.transferId,
    account_id: value.accountId,
    from_wallet: value.fromWallet,
    to_wallet: value.toWallet,
    gross_amount_minor: value.grossMinor.toString(),
    fee_minor: value.feeMinor.toString(),
    net_amount_minor: value.netMinor.toString(),
    currency: "USD" as const,
    reason: value.reason,
    recovery: {
      destination_wallet_minor: value.recovery.destinationWalletMinor.toString(),
      source_wallet_minor: value.recovery.sourceWalletMinor.toString(),
      fee_refunded_minor: value.recovery.feeRefundedMinor.toString(),
      debt_minor: value.recovery.debtMinor.toString(),
    },
    created_by: value.createdBy,
    correlation_id: value.correlationId,
    idempotency_key: value.idempotencyKey,
    created_at: value.createdAt.toISOString(),
  };
}
