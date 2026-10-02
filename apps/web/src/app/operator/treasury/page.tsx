import { OperatorTreasuryPage } from "@/components/operator/treasury";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorTreasuryPageRoute() {
  const access = await requireOperatorPage("/operator/treasury");
  return (
    <OperatorShell {...access} activeSection="treasury">
      <OperatorTreasuryPage canDelete={hasCapability(access.capabilities, "system.root")} />
    </OperatorShell>
  );
}
