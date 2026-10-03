import { apiError, authenticatedPrincipal } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { presentWithdrawal } from "../presentation";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ withdrawalId: string }> },
) {
  const principal = await authenticatedPrincipal(request);
  if (principal.kind === "anonymous")
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:read"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    return Response.json(
      presentWithdrawal(
        await getContainer().withdrawals.get(principal.accountId, (await params).withdrawalId),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
