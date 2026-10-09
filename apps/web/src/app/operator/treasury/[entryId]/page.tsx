import { OperatorTreasuryDetail } from "@/components/operator/treasury";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorTreasuryEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const access = await requireOperatorPage(`/operator/treasury/${encodeURIComponent(entryId)}`);
  return (
    <OperatorShell {...access} activeSection="treasury">
      <OperatorTreasuryDetail entryId={entryId} capabilities={access.capabilities} />
    </OperatorShell>
  );
}
