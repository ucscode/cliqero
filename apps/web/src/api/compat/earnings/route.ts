import { authenticatedAccount, apiError } from "../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const container = getContainer();
    const [earnings, policy] = await Promise.all([
      container.accountProjections.earnings(a.id),
      container.withdrawalPolicy.getActive(),
    ]);
    const withdrawalCurrency = policy.minimumAmount.currency;
    const currencies = [
      ...new Set([...earnings.balances.map((balance) => balance.currency), withdrawalCurrency]),
    ].sort();
    const withdrawableBalances = await Promise.all(
      currencies.map(async (currency) => ({
        currency,
        amount_minor: (await container.fundsReservation.available(a.id, currency)).toString(),
      })),
    );
    return Response.json({
      ...earnings,
      withdrawal_currency: withdrawalCurrency,
      withdrawable_balances: withdrawableBalances,
    });
  } catch (error) {
    return apiError(error);
  }
}
