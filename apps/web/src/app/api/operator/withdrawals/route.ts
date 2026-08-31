import { z } from "zod";
import { apiError, authenticatedAccount } from "../../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getContainer().operators.requireOperator(account.id);
    const state = z
      .enum(["requested", "approved", "rejected", "cancelled", "completed", "failed"])
      .optional()
      .parse(new URL(request.url).searchParams.get("state") ?? undefined);
    return Response.json({
      withdrawals: await getContainer().withdrawalRepository.listForOperator({ state }),
    });
  } catch (error) {
    return apiError(error);
  }
}
