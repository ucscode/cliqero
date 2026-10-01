import {
  internalWithdrawal,
  internalWithdrawalDelete,
  internalWithdrawalUpdate,
} from "@/api/internal/withdrawals/handler";

type Context = { params: Promise<{ withdrawalId: string }> };
export async function GET(request: Request, { params }: Context) {
  return internalWithdrawal(request, (await params).withdrawalId);
}
export async function PATCH(request: Request, { params }: Context) {
  return internalWithdrawalUpdate(request, (await params).withdrawalId);
}
export async function DELETE(request: Request, { params }: Context) {
  return internalWithdrawalDelete(request, (await params).withdrawalId);
}
