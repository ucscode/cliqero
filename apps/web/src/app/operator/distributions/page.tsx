import { OperatorDistributionList } from "@/components/operator-distributions";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorDistributionsPage() {
  const access = await requireOperatorPage("/operator/distributions");
  return (
    <OperatorShell {...access} activeSection="distributions" title="Distributions">
      <OperatorDistributionList />
    </OperatorShell>
  );
}
