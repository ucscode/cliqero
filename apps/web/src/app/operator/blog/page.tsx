import { OperatorBlogList } from "@/components/operator/blog";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";
export const dynamic = "force-dynamic";
export default async function OperatorBlogPage() {
  const access = await requireOperatorPage("/operator/blog");
  return (
    <OperatorShell {...access} activeSection="blog">
      <OperatorBlogList canDelete={hasCapability(access.capabilities, "content.manage")} />
    </OperatorShell>
  );
}
