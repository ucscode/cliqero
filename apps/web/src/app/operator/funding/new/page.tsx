import { AdministrativeFundingForm } from "@/components/operator/funding";
import { OperatorShell } from "@/components/operator/shell";
import { hasCapability } from "@/modules/identity/capabilities";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function NewFundingPage() {
  const access = await requireOperatorPage("/operator/funding/new");
  if (!hasCapability(access.capabilities, "finance.manage"))
    return <OperatorShell {...access} activeSection="funding" />;
  return (
    <OperatorShell {...access} activeSection="funding">
      <AdministrativeFundingForm />
    </OperatorShell>
  );
}
