import { internalEarningsAdjustmentDelete } from "@/api/internal/earnings-adjustments/handler";

export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return internalEarningsAdjustmentDelete(request, (await context.params).id);
}
