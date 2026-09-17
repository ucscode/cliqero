import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../../http";
import { getContainer } from "@/infrastructure/container";
import { projectFundingStatus } from "../../status";

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

    if (
      funding.state === "initialization_pending" &&
      ["paystack", "nowpayments", "bank_transfer", "development"].includes(funding.providerName)
    )
      await container.fundingInitialization.process(funding.id);

    const current = await container.funding.findById(id);
    if (!current || current.accountId !== account.id)
      return Response.json({ error: "Funding not found" }, { status: 404 });
    return Response.json(await projectFundingStatus(container, account.id, current));
  } catch (error) {
    return apiError(error);
  }
}
