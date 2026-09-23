import { authenticatedPrincipal } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { WALLET_OVERVIEW_ACTIVITY_LIMIT } from "@/modules/wallet/wallet";
export async function GET(request: Request) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("wallet:read"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  const values = await getContainer().wallet.history(
    principal.accountId,
    WALLET_OVERVIEW_ACTIVITY_LIMIT,
  );
  return Response.json({
    transactions: values.map((v) => ({
      id: v.id,
      type: v.kind,
      source_id: v.sourceId,
      state: v.state,
      amount_minor: v.amount.minorAmount.toString(),
      currency: v.amount.currency,
      created_at: v.createdAt.toISOString(),
      provider_display_name: v.kind === "funding_credit" ? (v.providerDisplayName ?? null) : null,
      ...(v.kind === "funding_credit" ? { provider_reference: v.providerReference ?? null } : {}),
    })),
  });
}
