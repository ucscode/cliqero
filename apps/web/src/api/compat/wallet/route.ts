import { authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";
import type { FundingTransaction } from "@/modules/funding/funding";

function isProjectableActiveFunding(value: unknown): value is FundingTransaction {
  if (!value || typeof value !== "object") return false;
  const funding = value as Partial<FundingTransaction>;
  const amount = funding.canonicalAmount;
  return (
    typeof funding.id === "string" &&
    typeof funding.providerName === "string" &&
    typeof funding.state === "string" &&
    !!amount &&
    typeof amount === "object" &&
    typeof amount.minorAmount === "bigint" &&
    typeof amount.currency === "string"
  );
}

export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const container = getContainer();
  const [s, active] = await Promise.all([
    container.wallet.summary(a.id),
    container.funding.findActiveForAccount?.(a.id) ?? Promise.resolve(null),
  ]);
  const rawActive: unknown = active;
  const activeFundings = (
    Array.isArray(rawActive) ? rawActive : rawActive ? [rawActive] : []
  ).filter(isProjectableActiveFunding);
  const projectActiveFunding = (funding: (typeof activeFundings)[number]) => {
    const paymentDetailsVisible =
      funding.state === "awaiting_payment" || funding.state === "verification_pending";
    return {
      id: funding.id,
      state: funding.state,
      provider: funding.providerName,
      provider_display_name:
        funding.providerInitialization?.providerDisplayName ??
        (typeof container.providers?.displayName === "function"
          ? container.providers.displayName(funding.providerName)
          : "Payment provider"),
      funding_reference: funding.providerReference,
      amount_minor: funding.canonicalAmount.minorAmount.toString(),
      currency: funding.canonicalAmount.currency,
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
      network: paymentDetailsVisible ? (funding.providerInitialization?.network ?? null) : null,
      instructions: paymentDetailsVisible
        ? (funding.providerInitialization?.instructions ?? null)
        : null,
      expires_at: paymentDetailsVisible
        ? (funding.providerInitialization?.expiresAt ?? null)
        : null,
    };
  };
  const projectedActiveFundings = activeFundings.map(projectActiveFunding);
  return Response.json({
    currency: "USD",
    available_minor: s.available.minorAmount.toString(),
    pending_minor: s.pending.minorAmount.toString(),
    active_funding: projectedActiveFundings[0] ?? null,
    active_fundings: projectedActiveFundings,
  });
}
