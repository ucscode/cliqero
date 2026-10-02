import { OperatorFundingList } from "@/components/operator/funding";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorFundingPage() {
  const access = await requireOperatorPage("/operator/funding");
  return (
    <OperatorShell {...access} activeSection="funding">
      <OperatorFundingList
        canManage={hasCapability(access.capabilities, "finance.manage")}
        canDelete={hasCapability(access.capabilities, "system.root")}
      />
    </OperatorShell>
  );
}
