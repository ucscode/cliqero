import { OperatorDistributionDetail } from "@/components/operator-distributions";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../../operator-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorDistributionDetailPage({
  params,
}: {
  params: Promise<{ distributionId: string }>;
}) {
  const access = await requireOperatorPage("/operator/distributions");
  if (access.role !== "operator") redirect("/operator");
  const { distributionId } = await params;
  return (
    <OperatorShell {...access} activeSection="distributions" title="Distribution detail">
      <OperatorDistributionDetail distributionId={distributionId} />
    </OperatorShell>
  );
}
