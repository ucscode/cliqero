import { OperatorPurchaseList } from "@/components/operator/purchases";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

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
      <OperatorPurchaseList
        capabilities={access.capabilities}
        initialBuyer={filters.buyer}
        initialListing={filters.listing}
        canDelete={hasCapability(access.capabilities, "system.root")}
      />
    </OperatorShell>
  );
}
