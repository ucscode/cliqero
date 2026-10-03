import { internalWithdrawalComplete } from "@/api/internal/withdrawals/handler";

type Context = { params: Promise<{ withdrawalId: string }> };

export async function POST(request: Request, { params }: Context) {
  return internalWithdrawalComplete(request, (await params).withdrawalId);
}
