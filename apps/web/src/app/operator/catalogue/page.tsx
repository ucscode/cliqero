import { OperatorCatalogueList } from "@/components/operator/catalogue";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorCataloguePage() {
  const access = await requireOperatorPage("/operator/catalogue");
  return (
    <OperatorShell {...access} activeSection="catalogue">
      <section aria-labelledby="operator-catalogue-heading">
        <OperatorCatalogueList canDelete={hasCapability(access.capabilities, "system.root")} />
      </section>
    </OperatorShell>
  );
}
