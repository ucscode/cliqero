import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireOperator(a.id);
    const s = await c.treasuryRepository.summary();
    return Response.json({
      balance_minor: s.balanceMinor.toString(),
      credits_minor: s.creditsMinor.toString(),
      debits_minor: s.debitsMinor.toString(),
      currency: "USD",
    });
  } catch (e) {
    return apiError(e);
  }
}
