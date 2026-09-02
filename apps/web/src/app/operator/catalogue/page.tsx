import { OperatorCatalogueList } from "@/components/operator-catalogue";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorCataloguePage() {
  const access = await requireOperatorPage("/operator/catalogue");
  return (
    <OperatorShell {...access} activeSection="catalogue" title="Catalogue">
      <section aria-labelledby="operator-catalogue-heading">
        <OperatorCatalogueList />
      </section>
    </OperatorShell>
  );
}
