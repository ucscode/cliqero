import { apiError } from "@/api/http";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { z } from "zod";
import { hasCapability } from "@/modules/identity/capabilities";
import { PublicApplicationError } from "@/kernel/errors";

type Container = Pick<
  ApplicationContainer,
  "principalResolver" | "operatorFunding" | "operatorAccounts"
>;
const state = z.enum(["confirmed", "failed", "blocked", "cancelled"]);
const createSchema = z
  .object({
    account_id: z.uuid(),
    amount_minor: z.string().regex(/^[1-9]\d*$/),
    state,
    reason: z.string().trim().min(1).max(1000),
    reference: z.string().trim().max(200).nullable().optional(),
  })
  .strict();
const updateSchema = z
  .object({
    amount_minor: z.string().regex(/^[1-9]\d*$/),
    state,
    reason: z.string().trim().min(1).max(1000),
    reference: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export class InternalFundingRoutes {
  constructor(private readonly container: Container) {}

  async create(request: Request) {
    const principal = await this.session(request, true);
    if (principal instanceof Response) return principal;
    try {
      const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
      if (!idempotencyKey || idempotencyKey.length > 200)
        throw new PublicApplicationError(
          "A valid Idempotency-Key is required.",
          "invalid_idempotency_key",
          400,
        );
      const body = createSchema.parse(await this.json(request));
      return this.respond(
        await this.container.operatorFunding.createAdministrative(principal.accountId, {
          accountId: body.account_id,
          amountMinor: body.amount_minor,
          state: body.state,
          reason: body.reason,
          reference: body.reference,
          idempotencyKey,
        }),
        201,
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  async accounts(request: Request) {
    const principal = await this.session(request);
    if (principal instanceof Response) return principal;
    try {
      if (!hasCapability(principal.capabilities, "finance.manage"))
        return this.respond(
          { error: "Funding management permission required", code: "forbidden" },
          403,
        );
      const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
      return this.respond(await this.container.operatorAccounts.list({ search, limit: 20 }));
    } catch (error) {
      return apiError(error, request);
    }
  }

  async update(request: Request, id: string) {
    const principal = await this.session(request, true);
    if (principal instanceof Response) return principal;
    try {
      const body = updateSchema.parse(await this.json(request));
      return this.respond(
        await this.container.operatorFunding.updateAdministrative(principal.accountId, id, {
          amountMinor: body.amount_minor,
          state: body.state,
          reason: body.reason,
          reference: body.reference,
        }),
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  async delete(request: Request, id: string) {
    const principal = await this.session(request, true);
    if (principal instanceof Response) return principal;
    try {
      return this.respond(
        await this.container.operatorFunding.deleteByOperator(principal.accountId, id),
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  async bulkDelete(request: Request) {
    const principal = await this.session(request, true);
    if (principal instanceof Response) return principal;
    try {
      const body = z
        .object({ ids: z.array(z.uuid()).min(1).max(100) })
        .strict()
        .parse(await this.json(request));
      return this.respond(
        await this.container.operatorFunding.bulkDeleteByOperator(principal.accountId, body.ids),
      );
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

  private respond(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }

  private async session(request: Request, mutation = false) {
    if (request.headers.has("authorization"))
      return this.respond({ error: "Unauthorized", code: "unauthorized" }, 401);
    if (mutation) {
      if (!isSameOriginRequest(request))
        return this.respond({ error: "Forbidden", code: "forbidden" }, 403);
    }
    try {
      const principal = await this.container.principalResolver.resolve(request);
      return principal.kind === "user_session"
        ? principal
        : this.respond({ error: "Unauthorized", code: "unauthorized" }, 401);
    } catch (error) {
      return apiError(error, request);
    }
  }
}

export const internalFundingCreate = (request: Request) =>
  new InternalFundingRoutes(getContainer()).create(request);
export const internalFundingAccounts = (request: Request) =>
  new InternalFundingRoutes(getContainer()).accounts(request);
export const internalFundingUpdate = (request: Request, id: string) =>
  new InternalFundingRoutes(getContainer()).update(request, id);
export const internalFundingDelete = (request: Request, id: string) =>
  new InternalFundingRoutes(getContainer()).delete(request, id);
export const internalFundingBulkDelete = (request: Request) =>
  new InternalFundingRoutes(getContainer()).bulkDelete(request);
