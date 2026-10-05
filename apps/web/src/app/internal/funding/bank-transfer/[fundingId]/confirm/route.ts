import { confirmBankTransfer } from "@/api/internal/funding/bank-transfer/handler";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fundingId: string }> },
) {
  return confirmBankTransfer(request, (await params).fundingId);
}
