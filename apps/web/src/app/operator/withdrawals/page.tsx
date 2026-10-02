import { OperatorWithdrawalList } from "@/components/operator/withdrawals";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorWithdrawalsPage() {
  const access = await requireOperatorPage("/operator/withdrawals");
  return (
    <OperatorShell {...access} activeSection="withdrawals">
      <OperatorWithdrawalList
        canManage={hasCapability(access.capabilities, "withdrawals.manage")}
        canDelete={hasCapability(access.capabilities, "system.root")}
      />
    </OperatorShell>
  );
}
