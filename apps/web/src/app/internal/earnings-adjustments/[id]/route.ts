import {
  internalEarningsAdjustment,
  internalEarningsAdjustmentDelete,
} from "@/api/internal/earnings-adjustments/handler";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return internalEarningsAdjustment(request, (await context.params).id);
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return internalEarningsAdjustmentDelete(request, (await context.params).id);
}
