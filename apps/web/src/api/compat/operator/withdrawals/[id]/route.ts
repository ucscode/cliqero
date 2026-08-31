import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getContainer().operators.requireOperator(account.id);
    const item = await getContainer().withdrawalRepository.findById((await params).id);
    if (!item) throw new Error("Withdrawal not found");
    return Response.json(item);
  } catch (error) {
    return apiError(error);
  }
}
