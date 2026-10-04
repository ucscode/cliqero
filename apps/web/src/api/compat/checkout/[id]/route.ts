import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { checkoutDetailSchema } from "../contracts";
export async function GET(request: Request, context: { params: Promise<{ checkoutId: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = await getContainer().checkoutRepository.findById((await context.params).checkoutId);
    if (!c || c.buyerId !== account.id)
      return Response.json({ error: "Checkout not found" }, { status: 404 });
    return Response.json(
      checkoutDetailSchema.parse({
        id: c.id,
        purchase_id: c.purchaseId,
        state: c.state,
        amount_minor: c.amount.minorAmount.toString(),
        currency: c.amount.currency,
      }),
    );
  } catch (e) {
    return apiError(e);
  }
}
