import { apiError } from "@/api/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";

type AdjustmentContainer = Pick<ApplicationContainer, "principalResolver" | "earningsAdjustments">;

/** Session-only root maintenance cleanup; not part of the public accounting resource API. */
export class InternalEarningsAdjustmentMaintenanceRoute {
  constructor(private readonly container: AdjustmentContainer) {}

  async delete(request: Request, id: string) {
    if (request.headers.has("authorization")) return this.noStore({ error: "Unauthorized" }, 401);
    if (!isSameOriginRequest(request)) return this.noStore({ error: "Forbidden" }, 403);
    try {
      const principal = await this.container.principalResolver.resolve(request);
      if (principal.kind !== "user_session") return this.noStore({ error: "Unauthorized" }, 401);
      return this.noStore(
        await this.container.earningsAdjustments.deleteForRoot(principal.accountId, id),
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  private noStore(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export const internalEarningsAdjustmentDelete = (request: Request, id: string) =>
  new InternalEarningsAdjustmentMaintenanceRoute(getContainer()).delete(request, id);
