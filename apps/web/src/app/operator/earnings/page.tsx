import { OperatorEarningsList } from "@/components/operator-earnings";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorEarningsPage() {
  const access = await requireOperatorPage("/operator/earnings");
  return (
    <OperatorShell {...access} activeSection="earnings" title="Earnings">
      <OperatorEarningsList />
    </OperatorShell>
  );
}
