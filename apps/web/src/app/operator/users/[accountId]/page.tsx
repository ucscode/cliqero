import { OperatorShell } from "@/components/operator/shell";
import { OperatorUserDetail } from "@/components/operator/users";
import { requireOperatorPage } from "../../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorUserDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const access = await requireOperatorPage(`/operator/users/${encodeURIComponent(accountId)}`);
  return (
    <OperatorShell {...access} activeSection="users">
      <OperatorUserDetail
        accountId={accountId}
        canManage={hasCapability(access.capabilities, "accounts.manage")}
      />
    </OperatorShell>
  );
}
