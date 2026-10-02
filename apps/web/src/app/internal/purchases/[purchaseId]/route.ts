import { internalPurchase, internalPurchaseDelete } from "@/api/internal/purchases/handler";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ purchaseId: string }> }) {
  const { purchaseId } = await context.params;
  return internalPurchase(request, purchaseId);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ purchaseId: string }> },
) {
  const { purchaseId } = await context.params;
  return internalPurchaseDelete(request, purchaseId);
}
