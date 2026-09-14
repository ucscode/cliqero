import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";
import { projectVerificationObservation } from "@/modules/funding/funding";

const schema = z.object({ transaction_hash: z.string().trim().min(1).max(128) }).strict();
const transactionHashPattern = /^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = schema.parse(await request.json());
    if (!transactionHashPattern.test(body.transaction_hash))
      return Response.json(
        { error: "Invalid TRON transaction hash.", code: "invalid_transaction_hash" },
        { status: 422 },
      );
    const funding = await getContainer().fundingService.submitTransaction({
      accountId: account.id,
      fundingId: (await params).id,
      transactionHash: body.transaction_hash,
    });
    return Response.json(
      {
        id: funding.id,
        state: funding.state,
        provider_transaction_id: funding.providerTransactionId ?? null,
        verification: projectVerificationObservation(funding.providerInitialization?.verification),
      },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
