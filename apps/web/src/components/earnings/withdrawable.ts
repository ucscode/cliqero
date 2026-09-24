import type { EarningsSummary } from "@/lib/api-client";

export function findWithdrawableBalance(
  summary: EarningsSummary | null,
): EarningsSummary["withdrawable_balances"][number] | null {
  const currency = summary?.withdrawal_currency;
  if (!currency) return null;

  return summary.withdrawable_balances?.find((balance) => balance.currency === currency) ?? null;
}
