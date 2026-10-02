import { OperatorBlogCategories } from "@/components/operator/blog/categories";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorBlogCategoriesPage() {
  const access = await requireOperatorPage("/operator/blog");
  return (
    <OperatorShell {...access} activeSection="blogCategories">
      <OperatorBlogCategories canDelete={hasCapability(access.capabilities, "system.root")} />
    </OperatorShell>
  );
}
