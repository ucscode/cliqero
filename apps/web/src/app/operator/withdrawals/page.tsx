import { OperatorWithdrawalList } from "@/components/operator-withdrawals";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorWithdrawalsPage() {
  const access = await requireOperatorPage("/operator/withdrawals");
  return (
    <OperatorShell {...access} activeSection="withdrawals" title="Withdrawals">
      <OperatorWithdrawalList />
    </OperatorShell>
  );
}
