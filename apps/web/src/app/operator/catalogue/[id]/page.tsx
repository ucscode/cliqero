import { OperatorCatalogueEditor } from "@/components/operator-catalogue";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOperatorPage(`/operator/catalogue/${encodeURIComponent(id)}`);
  return (
    <OperatorShell {...access} activeSection="catalogue" title="Edit listing">
      <OperatorCatalogueEditor listingId={id} />
    </OperatorShell>
  );
}
