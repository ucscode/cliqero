import { apiError } from "@/api/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";
import { z } from "zod";

type AdjustmentContainer = Pick<ApplicationContainer, "principalResolver" | "earningsAdjustments">;
const createSchema = z
  .object({
    account_id: z.uuid(),
    amount_minor: z.string().regex(/^-?[1-9]\d*$/),
    reason: z.string().trim().min(1).max(1000),
    reference: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

function noStore(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export class InternalEarningsAdjustmentRoutes {
  constructor(private readonly container: AdjustmentContainer) {}

  async collection(request: Request) {
    const principal = await this.session(request);
    if (principal instanceof Response) return principal;
    try {
      const params = new URL(request.url).searchParams;
      const limit = Math.max(1, Math.min(Number(params.get("limit") ?? 25), 100));
      return noStore(
        await this.container.earningsAdjustments.list(principal.accountId, {
          search: params.get("search") ?? undefined,
          cursor: params.get("cursor") ?? undefined,
          limit,
        }),
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  async create(request: Request) {
    const principal = await this.session(request, true);
    if (principal instanceof Response) return principal;
    try {
      if (
        request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
        "application/json"
      )
        return noStore(
          { error: "A JSON request body is required.", code: "unsupported_media_type" },
          415,
        );
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 16 * 1024)
        return noStore({ error: "Request body is too large.", code: "payload_too_large" }, 413);
      let bodyValue: unknown;
      try {
        bodyValue = JSON.parse(rawBody) as unknown;
      } catch {
        return noStore(
          { error: "Request body must contain valid JSON.", code: "invalid_request" },
          400,
        );
      }
      const body = createSchema.parse(bodyValue);
      const item = await this.container.earningsAdjustments.create(principal.accountId, {
        accountId: body.account_id,
        amountMinor: body.amount_minor,
        reason: body.reason,
        reference: body.reference,
      });
      return noStore(item, 201);
    } catch (error) {
      return apiError(error, request);
    }
  }

  async item(request: Request, id: string) {
    const principal = await this.session(request);
    if (principal instanceof Response) return principal;
    try {
      return noStore(await this.container.earningsAdjustments.get(principal.accountId, id));
    } catch (error) {
      return apiError(error, request);
    }
  }

  private async session(request: Request, mutation = false) {
    if (request.headers.has("authorization")) return noStore({ error: "Unauthorized" }, 401);
    if (mutation && !isSameOriginRequest(request)) return noStore({ error: "Forbidden" }, 403);
    try {
      const principal = await this.container.principalResolver.resolve(request);
      if (principal.kind !== "user_session") return noStore({ error: "Unauthorized" }, 401);
      return principal;
    } catch (error) {
      return apiError(error, request);
    }
  }
}

export const internalEarningsAdjustmentCollection = (request: Request) =>
  new InternalEarningsAdjustmentRoutes(getContainer()).collection(request);
export const internalEarningsAdjustmentCreate = (request: Request) =>
  new InternalEarningsAdjustmentRoutes(getContainer()).create(request);
export const internalEarningsAdjustment = (request: Request, id: string) =>
  new InternalEarningsAdjustmentRoutes(getContainer()).item(request, id);
