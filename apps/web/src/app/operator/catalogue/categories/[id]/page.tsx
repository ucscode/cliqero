import { notFound } from "next/navigation";
import { OperatorListingCategoryEditor } from "@/components/operator/catalogue/categories";
import { OperatorShell } from "@/components/operator/shell";
import { getContainer } from "@/infrastructure/container";
import { requireOperatorPage } from "../../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorListingCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireOperatorPage(
    `/operator/catalogue/categories/${encodeURIComponent(id)}`,
  );
  let category;
  try {
    category = await getContainer().listingCategories.get(id);
  } catch {
    notFound();
  }
  return (
    <OperatorShell {...access} activeSection="catalogue">
      <OperatorListingCategoryEditor initial={category} />
    </OperatorShell>
  );
}
