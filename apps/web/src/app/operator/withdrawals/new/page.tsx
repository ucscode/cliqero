import { OperatorWithdrawalForm } from "@/components/operator/withdrawals";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function NewWithdrawalPage() {
  const access = await requireOperatorPage("/operator/withdrawals/new");
  return (
    <OperatorShell {...access} activeSection="withdrawals">
      <OperatorWithdrawalForm />
    </OperatorShell>
  );
}
