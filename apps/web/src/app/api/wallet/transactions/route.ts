import { authenticatedAccount } from "../../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const values = await getContainer().wallet.history(a.id);
  return Response.json({
    transactions: values.map((v) => ({
      id: v.id,
      type: v.kind,
      source_id: v.sourceId,
      state: v.state,
      amount_minor: v.amount.minorAmount.toString(),
      currency: v.amount.currency,
      created_at: v.createdAt.toISOString(),
    })),
  });
}
