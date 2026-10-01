import { OperatorPurchaseDetail } from "@/components/operator/purchases";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorPurchaseDetailPage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const { purchaseId } = await params;
  const access = await requireOperatorPage(`/operator/purchases/${purchaseId}`);
  return (
    <OperatorShell {...access} activeSection="purchases">
      <OperatorPurchaseDetail purchaseId={purchaseId} />
    </OperatorShell>
  );
}
