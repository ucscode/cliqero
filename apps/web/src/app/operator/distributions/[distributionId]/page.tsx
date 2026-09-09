import { OperatorDistributionDetail } from "@/components/operator-distributions";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorDistributionDetailPage({
  params,
}: {
  params: Promise<{ distributionId: string }>;
}) {
  const access = await requireOperatorPage("/operator/distributions");
  const { distributionId } = await params;
  return (
    <OperatorShell {...access} activeSection="distributions" title="Distribution detail">
      <OperatorDistributionDetail distributionId={distributionId} />
    </OperatorShell>
  );
}
