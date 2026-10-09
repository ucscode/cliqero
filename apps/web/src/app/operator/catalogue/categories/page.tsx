import { OperatorListingCategories } from "@/components/operator/catalogue/categories";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorListingCategoriesPage() {
  const access = await requireOperatorPage("/operator/catalogue/categories");
  return (
    <OperatorShell {...access} activeSection="catalogueCategories">
      <OperatorListingCategories
        canDelete={hasCapability(access.capabilities, "catalogue.manage")}
      />
    </OperatorShell>
  );
}
