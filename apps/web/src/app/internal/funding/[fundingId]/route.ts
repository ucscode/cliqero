import { internalFundingDelete, internalFundingUpdate } from "@/api/internal/funding/handler";

export const runtime = "nodejs";
type Context = { params: Promise<{ fundingId: string }> };
export async function PATCH(request: Request, context: Context) {
  return internalFundingUpdate(request, (await context.params).fundingId);
}
export async function DELETE(request: Request, context: Context) {
  return internalFundingDelete(request, (await context.params).fundingId);
}
