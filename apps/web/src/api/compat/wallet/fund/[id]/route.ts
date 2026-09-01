import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const funding = await getContainer().funding.findById(id);
    if (!funding || funding.accountId !== account.id)
      return Response.json({ error: "Funding not found" }, { status: 404 });
    return Response.json({
      id: funding.id,
      state: funding.state,
      provider: funding.providerName,
      amount_minor: funding.canonicalAmount.minorAmount.toString(),
      currency: funding.canonicalAmount.currency,
      collection_amount_minor: funding.collectionAmount.minorAmount.toString(),
      collection_currency: funding.collectionAmount.currency,
      authorization_url:
        funding.state === "awaiting_payment"
          ? (funding.providerInitialization?.authorizationUrl ?? null)
          : null,
      confirmed_at: funding.confirmedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return apiError(error);
  }
}
