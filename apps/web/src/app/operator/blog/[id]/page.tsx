import { notFound, redirect } from "next/navigation";
import { OperatorBlogEditor } from "@/components/operator-blog";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../../operator-access";
import { getBlogService } from "@/modules/blog/application/blog-service";
export const dynamic = "force-dynamic";
export default async function EditBlogPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireOperatorPage("/operator/blog");
  if (access.role !== "operator" && access.role !== "blog_manager") redirect("/operator");
  const post = getBlogService().get((await params).id);
  if (!post) notFound();
  return (
    <OperatorShell {...access} activeSection="blog" title="Edit blog post">
      <OperatorBlogEditor initial={post} />
    </OperatorShell>
  );
}
