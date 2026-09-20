import { authenticatedAccount, apiError } from "../../../http";
import { getContainer } from "@/infrastructure/container";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const result = await getContainer().walletCheckoutPayment.pay({
      buyerId: account.id,
      checkoutId: id,
    });
    return Response.json({
      id: result.checkout.id,
      purchase_id: result.checkout.purchaseId,
      state: result.checkout.state,
      amount_minor: result.checkout.amount.minorAmount.toString(),
      currency: result.checkout.amount.currency,
      available: {
        amount_minor: result.wallet.available.minorAmount.toString(),
        currency: result.wallet.currency,
      },
      pending: {
        amount_minor: result.wallet.pending.minorAmount.toString(),
        currency: result.wallet.currency,
      },
      shortfall: {
        amount_minor: result.shortfall.minorAmount.toString(),
        currency: result.shortfall.currency,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
