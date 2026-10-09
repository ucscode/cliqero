import { OperatorEarningsAdjustmentDetail } from "@/components/operator/earnings-adjustments";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";
export default async function OperatorEarningsAdjustmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireOperatorPage(`/operator/earnings-adjustments/${id}`);
  return (
    <OperatorShell {...access} activeSection="adjustments">
      <OperatorEarningsAdjustmentDetail id={id} capabilities={access.capabilities} />
    </OperatorShell>
  );
}
