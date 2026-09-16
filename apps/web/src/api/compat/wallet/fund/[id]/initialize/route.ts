import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../../http";
import { getContainer } from "@/infrastructure/container";

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
      ["paystack", "nowpayments", "development"].includes(funding.providerName)
    )
      await container.fundingInitialization.process(funding.id);

    const current = await container.funding.findById(id);
    if (!current || current.accountId !== account.id)
      return Response.json({ error: "Funding not found" }, { status: 404 });
    const detailsVisible =
      current.state === "initialization_pending" ||
      current.state === "initializing" ||
      current.state === "awaiting_payment" ||
      current.state === "verification_pending";
    return Response.json({
      id: current.id,
      state: current.state,
      provider: current.providerName,
      funding_reference: current.providerReference,
      provider_transaction_id: current.providerTransactionId ?? null,
      authorization_url: detailsVisible
        ? (current.providerInitialization?.authorizationUrl ?? null)
        : null,
      access_code: detailsVisible ? (current.providerInitialization?.accessCode ?? null) : null,
      payment_address: detailsVisible
        ? (current.providerInitialization?.paymentAddress ?? null)
        : null,
      payment_amount: detailsVisible
        ? (current.providerInitialization?.paymentAmount ?? null)
        : null,
      payment_currency: detailsVisible
        ? (current.providerInitialization?.paymentCurrency ?? null)
        : null,
      network: detailsVisible ? (current.providerInitialization?.network ?? null) : null,
      expires_at: detailsVisible ? (current.providerInitialization?.expiresAt ?? null) : null,
    });
  } catch (error) {
    return apiError(error);
  }
}
