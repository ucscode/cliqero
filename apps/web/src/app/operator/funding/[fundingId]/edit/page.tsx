import { AdministrativeFundingForm } from "@/components/operator/funding";
import { OperatorShell } from "@/components/operator/shell";
import { hasCapability } from "@/modules/identity/capabilities";
import { requireOperatorPage } from "../../../operator-access";

export const dynamic = "force-dynamic";

export default async function EditFundingPage({
  params,
}: {
  params: Promise<{ fundingId: string }>;
}) {
  const access = await requireOperatorPage("/operator/funding");
  if (!hasCapability(access.capabilities, "finance.manage"))
    return <OperatorShell {...access} activeSection="funding" />;
  const { fundingId } = await params;
  return (
    <OperatorShell {...access} activeSection="funding">
      <AdministrativeFundingForm fundingId={fundingId} />
    </OperatorShell>
  );
}
