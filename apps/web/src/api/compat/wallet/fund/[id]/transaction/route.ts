import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";

const schema = z.object({ transaction_hash: z.string().trim().min(1).max(128) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = schema.parse(await request.json());
    const funding = await getContainer().fundingService.submitTransaction({
      accountId: account.id,
      fundingId: (await params).id,
      transactionHash: body.transaction_hash,
    });
    return Response.json({ id: funding.id, state: funding.state }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
