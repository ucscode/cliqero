import { notFound } from "next/navigation";
import { OperatorBlogCategoryEditor } from "@/components/operator/blog/categories";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../../operator-access";
import { getBlogService } from "@/infrastructure/blog/service";

export const dynamic = "force-dynamic";

export default async function EditOperatorBlogCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireOperatorPage("/operator/blog");
  const { id } = await params;
  const category = getBlogService()
    .categories()
    .find((item) => item.id === id);
  if (!category) notFound();
  return (
    <OperatorShell {...access} activeSection="blogCategories">
      <OperatorBlogCategoryEditor initial={category} />
    </OperatorShell>
  );
}
