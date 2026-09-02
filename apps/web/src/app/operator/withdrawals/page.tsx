import { OperatorWithdrawalList } from "@/components/operator-withdrawals";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorWithdrawalsPage() {
  const access = await requireOperatorPage("/operator/withdrawals");
  if (access.role !== "operator") redirect("/operator");
  return (
    <OperatorShell {...access} activeSection="withdrawals" title="Withdrawals">
      <OperatorWithdrawalList />
    </OperatorShell>
  );
}
