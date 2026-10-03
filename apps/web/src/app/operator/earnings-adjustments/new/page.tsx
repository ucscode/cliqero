import { OperatorEarningsAdjustmentForm } from "@/components/operator/earnings-adjustments";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewEarningsAdjustmentPage() {
  const access = await requireOperatorPage("/operator/earnings-adjustments/new");
  if (!hasCapability(access.capabilities, "finance.manage"))
    redirect("/operator/earnings-adjustments");
  return (
    <OperatorShell {...access} activeSection="adjustments">
      <OperatorEarningsAdjustmentForm />
    </OperatorShell>
  );
}
