import { apiError } from "@/api/http";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { z } from "zod";

type Container = Pick<
  ApplicationContainer,
  | "principalResolver"
  | "operatorWithdrawals"
  | "withdrawals"
  | "withdrawalDestinations"
  | "operatorAccounts"
>;
const createSchema = z
  .object({
    account_id: z.uuid(),
    amount_minor: z.string().regex(/^[1-9]\d*$/),
    destination_id: z.uuid(),
    idempotency_key: z.uuid(),
  })
  .strict();
const updateSchema = z
  .object({
    amount_minor: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    destination_id: z.uuid().optional(),
    state: z.enum(["requested", "approved", "rejected"]).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field must be updated.");
const completeSchema = z
  .object({
    external_reference: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
const querySchema = z.object({
  search: z.string().max(200).optional(),
  state: z
    .enum(["requested", "approved", "rejected", "cancelled", "completed", "failed", "all"])
    .optional(),
  attention: z.enum(["review", "action_required", "none"]).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["created", "amount"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export class InternalWithdrawalRoutes {
  constructor(private readonly container: Container) {}

  async collection(request: Request) {
    const principal = await this.session(request, "withdrawals.manage");
    if (principal instanceof Response) return principal;
    try {
      const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      return this.respond(
        await this.container.operatorWithdrawals.list({
          search: params.search,
          state: params.state === "all" ? undefined : params.state,
          attention: params.attention,
          cursor: params.cursor,
          limit: params.limit,
          sort: params.sort,
          direction: params.direction,
        }),
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  async item(request: Request, id: string) {
    const principal = await this.session(request, "withdrawals.manage");
    if (principal instanceof Response) return principal;
    try {
      return this.respond(await this.container.operatorWithdrawals.get(id));
    } catch (error) {
      return apiError(error, request);
    }
  }

  async destinations(request: Request) {
    const principal = await this.session(request, "withdrawals.manage");
    if (principal instanceof Response) return principal;
    try {
      const accountId = z.uuid().parse(new URL(request.url).searchParams.get("account_id"));
      return this.respond(await this.container.withdrawalDestinations.list(accountId));
    } catch (error) {
      return apiError(error, request);
    }
  }

  async accounts(request: Request) {
    const principal = await this.session(request, "withdrawals.manage");
    if (principal instanceof Response) return principal;
    try {
      const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
      return this.respond(await this.container.operatorAccounts.list({ search, limit: 20 }));
    } catch (error) {
      return apiError(error, request);
    }
  }

  async create(request: Request) {
    const principal = await this.session(request, "withdrawals.manage", true);
    if (principal instanceof Response) return principal;
    try {
      const body = createSchema.parse(await this.json(request));
      const created = await this.container.withdrawals.requestByOperator(principal.accountId, {
        accountId: body.account_id,
        amountMinor: body.amount_minor,
        destinationId: body.destination_id,
        idempotencyKey: body.idempotency_key,
      });
      return this.respond(await this.container.operatorWithdrawals.get(created.id), 201);
    } catch (error) {
      return apiError(error, request);
    }
  }

  async update(request: Request, id: string) {
    const principal = await this.session(request, "withdrawals.manage", true);
    if (principal instanceof Response) return principal;
    try {
      const body = updateSchema.parse(await this.json(request));
      await this.container.withdrawals.update(principal.accountId, id, {
        amountMinor: body.amount_minor,
        destinationId: body.destination_id,
        state: body.state,
        reason: body.reason,
      });
      return this.respond(await this.container.operatorWithdrawals.get(id));
    } catch (error) {
      return apiError(error, request);
    }
  }

  async complete(request: Request, id: string) {
    const principal = await this.session(request, "withdrawals.manage", true);
    if (principal instanceof Response) return principal;
    try {
      const body = completeSchema.parse(await this.json(request));
      await this.container.withdrawals.complete(principal.accountId, id, {
        externalReference: body.external_reference,
        note: body.note,
      });
      return this.respond(await this.container.operatorWithdrawals.get(id));
    } catch (error) {
      return apiError(error, request);
    }
  }

  async delete(request: Request, id: string) {
    const principal = await this.session(request, "withdrawals.manage", true);
    if (principal instanceof Response) return principal;
    try {
      return this.respond(await this.container.withdrawals.delete(principal.accountId, id));
    } catch (error) {
      return apiError(error, request);
    }
  }

  async bulkDelete(request: Request) {
    const principal = await this.session(request, "withdrawals.manage", true);
    if (principal instanceof Response) return principal;
    try {
      const { ids } = z
        .object({ ids: z.array(z.uuid()).min(1).max(100) })
        .strict()
        .parse(await this.json(request));
      const results = [];
      for (const id of [...new Set(ids)]) {
        try {
          await this.container.withdrawals.delete(principal.accountId, id);
          results.push({ id, deleted: true, error: null });
        } catch (error) {
          results.push({
            id,
            deleted: false,
            error: error instanceof Error ? error.message : "Withdrawal could not be deleted.",
          });
        }
      }
      return this.respond({ results });
    } catch (error) {
      return apiError(error, request);
    }
  }

  private async json(request: Request) {
    if (
      request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
    )
      throw new Error("A JSON request body is required.");
    return request.json() as Promise<unknown>;
  }

  private respond(value: unknown, status = 200) {
    return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  }

  private async session(request: Request, capability: string, mutation = false) {
    if (request.headers.has("authorization"))
      return this.respond({ error: "Unauthorized", code: "unauthorized" }, 401);
    if (mutation && !isSameOriginRequest(request))
      return this.respond({ error: "Forbidden", code: "forbidden" }, 403);
    try {
      const principal = await this.container.principalResolver.resolve(request);
      if (principal.kind !== "user_session")
        return this.respond({ error: "Unauthorized", code: "unauthorized" }, 401);
      if (!hasCapability(principal.capabilities, capability))
        return this.respond({ error: "Forbidden", code: "forbidden" }, 403);
      return principal;
    } catch (error) {
      return apiError(error, request);
    }
  }
}

export const internalWithdrawals = (request: Request) =>
  new InternalWithdrawalRoutes(getContainer()).collection(request);
export const internalWithdrawal = (request: Request, id: string) =>
  new InternalWithdrawalRoutes(getContainer()).item(request, id);
export const internalWithdrawalDestinations = (request: Request) =>
  new InternalWithdrawalRoutes(getContainer()).destinations(request);
export const internalWithdrawalAccounts = (request: Request) =>
  new InternalWithdrawalRoutes(getContainer()).accounts(request);
export const internalWithdrawalCreate = (request: Request) =>
  new InternalWithdrawalRoutes(getContainer()).create(request);
export const internalWithdrawalUpdate = (request: Request, id: string) =>
  new InternalWithdrawalRoutes(getContainer()).update(request, id);
export const internalWithdrawalComplete = (request: Request, id: string) =>
  new InternalWithdrawalRoutes(getContainer()).complete(request, id);
export const internalWithdrawalDelete = (request: Request, id: string) =>
  new InternalWithdrawalRoutes(getContainer()).delete(request, id);
export const internalWithdrawalBulkDelete = (request: Request) =>
  new InternalWithdrawalRoutes(getContainer()).bulkDelete(request);
