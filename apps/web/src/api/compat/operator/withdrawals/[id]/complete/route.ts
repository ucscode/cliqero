import { apiError, authenticatedAccount } from "../../../../http";
import { getContainer } from "@/infrastructure/container";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getContainer().operators.requireOperator(account.id);
    return Response.json(
      await getContainer().payoutExecution.manualComplete(
        (await params).id,
        account.id,
        crypto.randomUUID(),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
