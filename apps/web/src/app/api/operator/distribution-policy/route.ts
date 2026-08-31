import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireOperator(a.id);
    const p = await c.yamlCommissionPolicy.getActive();
    return Response.json({
      levels: p.rates.map((percentage, idx) => ({ level: idx + 1, percentage })),
      allocated_percentage: p.percentages.reduce((s, v) => s + v, 0),
      maximum_payable_level: p.maximumRewardedDepth,
      nominal_platform_remainder_percentage: 100 - p.percentages.reduce((s, v) => s + v, 0),
    });
  } catch (e) {
    return apiError(e);
  }
}
