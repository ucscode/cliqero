import { OperatorPurchaseList } from "@/components/operator/purchases";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ buyer?: string; listing?: string }>;
}) {
  const access = await requireOperatorPage("/operator/purchases");
  const filters = await searchParams;
  return (
    <OperatorShell {...access} activeSection="purchases">
      <OperatorPurchaseList initialBuyer={filters.buyer} initialListing={filters.listing} />
    </OperatorShell>
  );
}
