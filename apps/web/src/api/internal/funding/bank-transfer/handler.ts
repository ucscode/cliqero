import { apiError } from "@/api/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { getContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";

export async function confirmBankTransfer(request: Request, fundingId: string) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  try {
    const container = getContainer();
    const principal = await container.principalResolver.resolve(request);
    if (
      principal.kind !== "user_session" ||
      !hasCapability(principal.capabilities, "finance.manage")
    )
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    return Response.json(
      await container.operatorFunding.confirmBankTransfer(principal.accountId, fundingId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error, request);
  }
}
