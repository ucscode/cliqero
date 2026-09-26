import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";
import { projectVerificationObservation } from "@/modules/funding/funding";
import { PublicApplicationError } from "@/kernel/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const funding = await getContainer().fundingService.submitProviderRequest({
      accountId: account.id,
      fundingId: (await params).id,
      payload: await request.json(),
    });
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
