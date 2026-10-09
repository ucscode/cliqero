import { OperatorEarningsAdjustments } from "@/components/operator/earnings-adjustments";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";
export default async function OperatorEarningsAdjustmentsPage() {
  const access = await requireOperatorPage("/operator/earnings-adjustments");
  return (
    <OperatorShell {...access} activeSection="adjustments">
      <OperatorEarningsAdjustments
        capabilities={access.capabilities}
        canManage={hasCapability(access.capabilities, "finance.manage")}
        canDelete={hasCapability(access.capabilities, "system.root")}
      />
    </OperatorShell>
  );
}
