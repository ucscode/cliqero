import { OperatorBlogList } from "@/components/operator-blog";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";
export const dynamic = "force-dynamic";
export default async function OperatorBlogPage() {
  const access = await requireOperatorPage("/operator/blog");
  return (
    <OperatorShell {...access} activeSection="blog" title="Blog">
      <OperatorBlogList />
    </OperatorShell>
  );
}
