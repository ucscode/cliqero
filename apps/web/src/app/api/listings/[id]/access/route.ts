import { apiError, authenticatedSessionAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedSessionAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const destination = await getContainer().buyerAccess.handoff(
      account,
      (await params).id,
      request.headers.get("idempotency-key") ?? undefined,
    );
    return Response.redirect(destination, 307);
  } catch (error) {
    return apiError(error);
  }
}
