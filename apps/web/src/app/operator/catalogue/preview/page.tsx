import { OperatorCatalogueDraftPreview } from "@/components/operator/catalogue";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorCataloguePreviewPage() {
  const access = await requireOperatorPage("/operator/catalogue/preview");
  return (
    <OperatorShell {...access} activeSection="catalogue">
      <OperatorCatalogueDraftPreview />
    </OperatorShell>
  );
}
