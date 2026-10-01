import { OperatorWithdrawalDetail } from "@/components/operator/withdrawals";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorWithdrawalDetailPage({
  params,
}: {
  params: Promise<{ withdrawalId: string }>;
}) {
  const { withdrawalId } = await params;
  const access = await requireOperatorPage(
    `/operator/withdrawals/${encodeURIComponent(withdrawalId)}`,
  );
  return (
    <OperatorShell {...access} activeSection="withdrawals">
      <OperatorWithdrawalDetail
        withdrawalId={withdrawalId}
        canManage={hasCapability(access.capabilities, "withdrawals.manage")}
      />
    </OperatorShell>
  );
}
