import { OperatorEarningsList } from "@/components/operator/earnings";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorEarningsPage() {
  const access = await requireOperatorPage("/operator/earnings");
  return (
    <OperatorShell {...access} activeSection="earnings">
      <OperatorEarningsList
        canDelete={hasCapability(access.capabilities, "system.root")}
        canManage={hasCapability(access.capabilities, "finance.manage")}
        canReadCorrections={hasCapability(access.capabilities, "finance.read")}
      />
    </OperatorShell>
  );
}
