import { OperatorBlogCategoryEditor } from "@/components/operator/blog/categories";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../../operator-access";

export const dynamic = "force-dynamic";

export default async function NewOperatorBlogCategoryPage() {
  const access = await requireOperatorPage("/operator/blog");
  return (
    <OperatorShell {...access} activeSection="blogCategories">
      <OperatorBlogCategoryEditor />
    </OperatorShell>
  );
}
