import { apiError, authenticatedPrincipal } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { presentWithdrawal } from "../presentation";
import { z } from "zod";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(
      presentWithdrawal(
        await getContainer().withdrawals.get(principal.accountId, (await params).id),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:create"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    z.object({ status: z.literal("cancelled") })
      .strict()
      .parse(await request.json());
    return Response.json(
      presentWithdrawal(
        await getContainer().withdrawals.cancel(principal.accountId, (await params).id),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
