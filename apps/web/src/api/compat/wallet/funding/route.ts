import { apiError, authenticatedAccount } from "../../../http";
import type { FundingState } from "@/modules/funding/funding";
import { getContainer } from "@/infrastructure/container";

const states: FundingState[] = [
  "initialization_pending",
  "initializing",
  "awaiting_payment",
  "verification_pending",
  "confirmed",
  "failed",
  "blocked",
  "cancelled",
  "reconciliation_pending",
];

export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    const state = query.get("state") ?? undefined;
    if (state && !states.includes(state as FundingState))
      return Response.json({ error: "Funding state is invalid" }, { status: 400 });
    const cursor = query.get("cursor") || undefined;
    const limit = Math.max(1, Math.min(Number(query.get("limit") ?? 20) || 20, 50));
    const active = query.get("active") === "true";
    const page = await getContainer().funding.findHistoryForAccount?.({
      accountId: account.id,
      cursor,
      limit,
      state: state as FundingState | undefined,
      active,
    });
    return Response.json({
      items: (page?.items ?? []).map((funding) => ({
        id: funding.id,
        provider: funding.providerName,
        provider_display_name:
          typeof getContainer().providers.displayName === "function"
            ? getContainer().providers.displayName(funding.providerName)
            : funding.providerName,
        funding_reference: funding.providerReference,
        state: funding.state,
        amount_minor: funding.canonicalAmount.minorAmount.toString(),
        currency: funding.canonicalAmount.currency,
        collection_amount_minor: funding.collectionAmount.minorAmount.toString(),
        collection_currency: funding.collectionAmount.currency,
        created_at: funding.createdAt?.toISOString() ?? null,
        confirmed_at: funding.confirmedAt?.toISOString() ?? null,
      })),
      next_cursor: page?.nextCursor ?? null,
    });
  } catch (error) {
    return apiError(error);
  }
}
