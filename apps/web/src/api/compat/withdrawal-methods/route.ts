import { apiError, authenticatedPrincipal } from "../http";
import { getContainer } from "@/infrastructure/container";

export async function GET(request: Request) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:read"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    return Response.json(
      await getContainer().withdrawalDestinations.methodsFor(principal.accountId),
    );
  } catch (error) {
    return apiError(error);
  }
}
