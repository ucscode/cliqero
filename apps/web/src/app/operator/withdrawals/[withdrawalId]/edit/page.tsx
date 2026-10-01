import { OperatorWithdrawalForm } from "@/components/operator/withdrawals";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../../operator-access";

export const dynamic = "force-dynamic";

export default async function EditWithdrawalPage({
  params,
}: {
  params: Promise<{ withdrawalId: string }>;
}) {
  const { withdrawalId } = await params;
  const access = await requireOperatorPage("/operator/withdrawals");
  return (
    <OperatorShell {...access} activeSection="withdrawals">
      <OperatorWithdrawalForm withdrawalId={withdrawalId} />
    </OperatorShell>
  );
}
