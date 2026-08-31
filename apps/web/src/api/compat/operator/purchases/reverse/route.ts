import { z } from "zod";
import { newId } from "@/kernel/ids";
import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
const schema = z.object({ purchase_id: z.uuid(), reason: z.string().trim().min(3).max(500) });
export async function POST(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getContainer().operators.requireOperator(account.id);
    const key = request.headers.get("idempotency-key");
    if (!key || key.length > 200) throw new Error("A valid Idempotency-Key is required");
    const body = schema.parse(await request.json());
    const reversal = await getContainer().purchaseReversal.process({
      purchaseId: body.purchase_id,
      reason: body.reason,
      source: "operator",
      idempotencyKey: key,
      correlationId: newId(),
    });
    return Response.json({ reversal });
  } catch (error) {
    return apiError(error);
  }
}
