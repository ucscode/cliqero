import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";
import { projectVerificationObservation } from "@/modules/funding/funding";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Funding not found" }, { status: 404 });
  try {
    const container = getContainer();
    const funding = await container.funding.findById(id);
    if (!funding || funding.accountId !== account.id)
      return Response.json({ error: "Funding not found" }, { status: 404 });
    const current =
      funding.state === "awaiting_payment" || funding.state === "verification_pending"
        ? ((await container.fundingVerification.process(id, {
            rethrowProviderErrors: false,
          })) ?? funding)
        : funding;
    return Response.json({
      id: current.id,
      state: current.state,
      provider_transaction_id: current.providerTransactionId ?? null,
      verification: projectVerificationObservation(current.providerInitialization?.verification),
    });
  } catch (error) {
    return apiError(error);
  }
}
