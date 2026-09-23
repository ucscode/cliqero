import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCapability(a.id, "finance.read");
    const p = await c.yamlCommissionPolicy.getActive();
    const allocatedPercentage =
      p.platformRateBasisPoints / 100 + p.percentages.reduce((sum, value) => sum + value, 0);
    return Response.json({
      platform_percentage: p.platformRateBasisPoints / 100,
      levels: p.levels.map((entry) => ({
        level: entry.level,
        percentage: entry.rateBasisPoints / 100,
      })),
      allocated_percentage: allocatedPercentage,
      maximum_payable_level: p.maximumRewardedDepth,
      nominal_platform_remainder_percentage: 100 - allocatedPercentage,
    });
  } catch (e) {
    return apiError(e);
  }
}
