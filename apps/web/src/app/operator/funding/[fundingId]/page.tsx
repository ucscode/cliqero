import { OperatorFundingDetail } from "@/components/operator-funding";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorFundingDetailPage({
  params,
}: {
  params: Promise<{ fundingId: string }>;
}) {
  const { fundingId } = await params;
  const access = await requireOperatorPage(`/operator/funding/${encodeURIComponent(fundingId)}`);
  return (
    <OperatorShell {...access} activeSection="funding" title="Funding detail">
      <OperatorFundingDetail fundingId={fundingId} />
    </OperatorShell>
  );
}
