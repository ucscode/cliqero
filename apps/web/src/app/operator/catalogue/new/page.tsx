import { OperatorCatalogueEditor } from "@/components/operator-catalogue";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function NewOperatorListingPage() {
  const access = await requireOperatorPage("/operator/catalogue/new");
  return (
    <OperatorShell {...access} activeSection="catalogue" title="New listing">
      <OperatorCatalogueEditor />
    </OperatorShell>
  );
}
