import { OperatorBlogEditor } from "@/components/operator-blog";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../../operator-access";
export const dynamic = "force-dynamic";
export default async function NewBlogPage() {
  const access = await requireOperatorPage("/operator/blog/new");
  return (
    <OperatorShell {...access} activeSection="blog" title="New blog post">
      <OperatorBlogEditor />
    </OperatorShell>
  );
}
