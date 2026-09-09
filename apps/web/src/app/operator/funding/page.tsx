import { OperatorFundingList } from "@/components/operator-funding";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorFundingPage() {
  const access = await requireOperatorPage("/operator/funding");
  return (
    <OperatorShell {...access} activeSection="funding" title="Funding">
      <OperatorFundingList />
    </OperatorShell>
  );
}
