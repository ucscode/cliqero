import { internalWithdrawalTransition } from "@/api/internal/withdrawals/handler";

type Context = { params: Promise<{ withdrawalId: string }> };
export async function POST(request: Request, { params }: Context) {
  return internalWithdrawalTransition(request, (await params).withdrawalId);
}
