import { apiAuthorizer } from "@/api/shared/authorization";
import { authenticatedPrincipal } from "@/api/http";
import { getContainer } from "@/infrastructure/container";
import { isAuthenticatedPrincipal } from "@/modules/identity/api/principal";

export async function authorizeListingIntegration(request: Request, listingId: string) {
  const container = getContainer();
  const principal = await authenticatedPrincipal(request);
  if (!isAuthenticatedPrincipal(principal))
    return {
      response: Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 }),
    };

  if (principal.kind === "user_session") {
    try {
      await container.listingService.getOwner(principal.account, listingId);
      return { principal, container, access: "owner" as const };
    } catch {
      // A catalogue manager may access listings they do not own.
    }
  }

  const denied = apiAuthorizer.authorize(
    principal,
    {
      mode: "account",
      capability: "catalogue.manage",
      scope: "catalogue:manage",
    },
    request.headers.has("authorization"),
  );
  if (denied)
    return {
      response: Response.json({ error: "Listing not found", code: "not_found" }, { status: 404 }),
    };
  try {
    await container.listingService.getCatalogue(listingId);
    return { principal, container, access: "manager" as const };
  } catch {
    return {
      response: Response.json({ error: "Listing not found", code: "not_found" }, { status: 404 }),
    };
  }
}
