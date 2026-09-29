import { OperatorListingCategoryEditor } from "@/components/operator/catalogue/categories";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../../operator-access";

export const dynamic = "force-dynamic";

export default async function NewOperatorListingCategoryPage() {
  const access = await requireOperatorPage("/operator/catalogue/categories/new");
  return (
    <OperatorShell {...access} activeSection="catalogue">
      <OperatorListingCategoryEditor />
    </OperatorShell>
  );
}
