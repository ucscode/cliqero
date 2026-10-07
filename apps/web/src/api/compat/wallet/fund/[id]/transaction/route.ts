import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";
import { projectVerificationObservation } from "@/modules/funding/funding";
import { PublicApplicationError } from "@/kernel/errors";
import { z } from "zod";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fundingId: string }> },
) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const container = getContainer();
    const fundingId = (await params).fundingId;
    if (!z.uuid().safeParse(fundingId).success)
      return Response.json({ error: "Funding not found", code: "not_found" }, { status: 404 });
    const body = z
      .object({ transaction_hash: z.string().min(1).max(200) })
      .strict()
      .parse(await request.json());
    const funding = await container.fundingOperations.submitProviderTransaction(
      account.id,
      fundingId,
      { transaction_hash: body.transaction_hash },
    );
    if (!funding) throw new PublicApplicationError("Funding not found", "not_found", 404);
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
