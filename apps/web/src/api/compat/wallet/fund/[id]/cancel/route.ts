import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../../http";
import { getContainer } from "@/infrastructure/container";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Funding not found" }, { status: 404 });
  try {
    const funding = await getContainer().fundingService.cancel({
      accountId: account.id,
      fundingId: id,
    });
    return Response.json({ id: funding.id, state: funding.state });
  } catch (error) {
    return apiError(error);
  }
}
