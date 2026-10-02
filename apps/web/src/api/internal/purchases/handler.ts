import { apiError } from "@/api/http";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";
import { crudMaxRows } from "@/config/crud";
import { z } from "zod";
import { hasCapability } from "@/modules/identity/capabilities";

type PurchaseContainer = Pick<ApplicationContainer, "principalResolver" | "operatorPurchases">;

const querySchema = z.object({
  buyer: z.uuid().optional(),
  listing: z.uuid().optional(),
  state: z.enum(["pending", "paid", "completed", "failed", "refunded"]).optional(),
  sort: z.enum(["created"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(crudMaxRows()).default(crudMaxRows()),
});

/** Session-only read surface for the internal Operator purchase inspector. */
export class InternalPurchaseRoutes {
  constructor(private readonly container: PurchaseContainer) {}

  async collection(request: Request) {
    const principal = await this.session(request);
    if (principal instanceof Response) return principal;
    try {
      const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      return Response.json(
        await this.container.operatorPurchases.list(principal.accountId, query),
        {
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  async item(request: Request, purchaseId: string) {
    const principal = await this.session(request);
    if (principal instanceof Response) return principal;
    try {
      return Response.json(
        await this.container.operatorPurchases.get(principal.accountId, purchaseId),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  async delete(request: Request, purchaseId: string) {
    const principal = await this.session(request);
    if (principal instanceof Response) return principal;
    try {
      if (!hasCapability(principal.capabilities, "system.root"))
        return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
      const deleted = await this.container.operatorPurchases.deleteForRoot(
        principal.accountId,
        purchaseId,
      );
      if (!deleted)
        return Response.json({ error: "Purchase not found", code: "not_found" }, { status: 404 });
      return Response.json(
        { id: purchaseId, deleted: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  private async session(request: Request) {
    if (request.headers.has("authorization"))
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    try {
      const principal = await this.container.principalResolver.resolve(request);
      if (principal.kind !== "user_session")
        return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
      return principal;
    } catch (error) {
      return apiError(error, request);
    }
  }
}

export function internalPurchases(request: Request) {
  return new InternalPurchaseRoutes(getContainer()).collection(request);
}

export function internalPurchase(request: Request, purchaseId: string) {
  return new InternalPurchaseRoutes(getContainer()).item(request, purchaseId);
}

export function internalPurchaseDelete(request: Request, purchaseId: string) {
  return new InternalPurchaseRoutes(getContainer()).delete(request, purchaseId);
}
