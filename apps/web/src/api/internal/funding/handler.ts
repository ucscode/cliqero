import { apiError } from "@/api/http";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";

type Container = Pick<ApplicationContainer, "principalResolver" | "operatorAccounts">;

export class InternalFundingAccountRoutes {
  constructor(private readonly container: Container) {}

  async list(request: Request) {
    if (request.headers.has("authorization"))
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    try {
      const principal = await this.container.principalResolver.resolve(request);
      if (principal.kind !== "user_session")
        return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
      if (!hasCapability(principal.capabilities, "finance.manage"))
        return Response.json(
          { error: "Funding management permission required", code: "forbidden" },
          { status: 403 },
        );
      const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
      const result = await this.container.operatorAccounts.list({ search, limit: 20 });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return apiError(error, request);
    }
  }
}

export const internalFundingAccounts = (request: Request) =>
  new InternalFundingAccountRoutes(getContainer()).list(request);
