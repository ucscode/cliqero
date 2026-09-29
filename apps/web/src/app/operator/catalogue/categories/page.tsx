import { OperatorListingCategories } from "@/components/operator/catalogue/categories";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorListingCategoriesPage() {
  const access = await requireOperatorPage("/operator/catalogue/categories");
  return (
    <OperatorShell {...access} activeSection="catalogue">
      <OperatorListingCategories />
    </OperatorShell>
  );
}
