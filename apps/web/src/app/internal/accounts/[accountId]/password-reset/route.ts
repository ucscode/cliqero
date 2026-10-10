import { POST as resetPassword } from "@/api/internal/accounts/password-reset/route";

export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }) {
  return resetPassword(request, (await context.params).accountId);
}
