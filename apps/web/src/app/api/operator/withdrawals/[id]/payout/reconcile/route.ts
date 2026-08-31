import { apiError, authenticatedAccount } from "../../../../../http";
import { getContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getContainer().operators.requireOperator(account.id);
    return Response.json(
      await getContainer().payoutExecution.reconcile((await params).id, newId()),
    );
  } catch (error) {
    return apiError(error);
  }
}
