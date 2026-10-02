import { OperatorDistributionList } from "@/components/operator/distributions";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorDistributionsPage() {
  const access = await requireOperatorPage("/operator/distributions");
  return (
    <OperatorShell {...access} activeSection="distributions">
      <OperatorDistributionList canDelete={hasCapability(access.capabilities, "system.root")} />
    </OperatorShell>
  );
}
