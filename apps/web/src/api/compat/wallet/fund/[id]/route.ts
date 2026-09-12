import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { formatMinorMoney, Money } from "@/modules/money/money";

export function customerFailureMessage(funding: {
  providerInitialization?: {
    failureCode?: string;
    failureMessage?: string;
    failureAmountMinor?: string;
    failureCurrency?: string;
  };
}) {
  const initialization = funding.providerInitialization;
  if (initialization?.failureCode === "AMOUNT_MINIMAL_ERROR") {
    const amount = initialization.failureAmountMinor;
    const currency = initialization.failureCurrency;
    if (amount && currency && /^[1-9]\d*$/.test(amount) && /^[A-Z]{3}$/.test(currency))
      return `The minimum funding amount is ${formatMinorMoney(Money.of(BigInt(amount), currency))}.`;
    const legacy = initialization.failureMessage?.match(
      /^The minimum funding amount is ([1-9]\d*) ([A-Z]{3})\.$/,
    );
    if (legacy) {
      return `The minimum funding amount is ${formatMinorMoney(Money.of(BigInt(legacy[1]), legacy[2]))}.`;
    }
  }
  return initialization?.failureMessage ?? null;
}

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
    const paymentDetailsVisible =
      funding.state === "awaiting_payment" || funding.state === "verification_pending";
    return Response.json({
      id: funding.id,
      state: funding.state,
      provider: funding.providerName,
      provider_display_name:
        funding.providerInitialization?.providerDisplayName ??
        (typeof getContainer().providers?.displayName === "function"
          ? getContainer().providers.displayName(funding.providerName)
          : "Payment provider"),
      funding_reference: funding.providerReference,
      amount_minor: funding.canonicalAmount.minorAmount.toString(),
      currency: funding.canonicalAmount.currency,
      collection_amount_minor: funding.collectionAmount.minorAmount.toString(),
      collection_currency: funding.collectionAmount.currency,
      provider_account_id: paymentDetailsVisible
        ? (funding.providerInitialization?.providerAccountId ?? null)
        : null,
      provider_account_snapshot: paymentDetailsVisible
        ? (funding.providerInitialization?.providerAccountSnapshot ?? null)
        : null,
      authorization_url: paymentDetailsVisible
        ? (funding.providerInitialization?.authorizationUrl ?? null)
        : null,
      payment_address: paymentDetailsVisible
        ? (funding.providerInitialization?.paymentAddress ?? null)
        : null,
      payment_amount: paymentDetailsVisible
        ? (funding.providerInitialization?.paymentAmount ?? null)
        : null,
      payment_currency: paymentDetailsVisible
        ? (funding.providerInitialization?.paymentCurrency ?? null)
        : null,
      asset: paymentDetailsVisible ? (funding.providerInitialization?.asset ?? null) : null,
      network: paymentDetailsVisible ? (funding.providerInitialization?.network ?? null) : null,
      instructions: paymentDetailsVisible
        ? (funding.providerInitialization?.instructions ?? null)
        : null,
      expires_at: paymentDetailsVisible
        ? (funding.providerInitialization?.expiresAt ?? null)
        : null,
      error_code: funding.providerInitialization?.failureCode ?? null,
      error_message: customerFailureMessage(funding),
      confirmed_at: funding.confirmedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return apiError(error);
  }
}
