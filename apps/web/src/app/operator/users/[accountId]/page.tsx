import { OperatorShell } from "@/components/operator-shell";
import { OperatorUserDetail } from "@/components/operator-users";
import { requireOperatorPage } from "../../operator-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorUserDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const access = await requireOperatorPage(`/operator/users/${encodeURIComponent(accountId)}`);
  if (access.role !== "operator") redirect("/operator");
  return (
    <OperatorShell {...access} activeSection="users" title="Account">
      <OperatorUserDetail accountId={accountId} />
    </OperatorShell>
  );
}
