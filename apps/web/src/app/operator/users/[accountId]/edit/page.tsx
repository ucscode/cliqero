import { OperatorShell } from "@/components/operator/shell";
import { OperatorUserForm } from "@/components/operator/users";
import { requireOperatorPage } from "../../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorUserEditPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const access = await requireOperatorPage(`/operator/users/${encodeURIComponent(accountId)}/edit`);
  return (
    <OperatorShell {...access} activeSection="users">
      <OperatorUserForm accountId={accountId} />
    </OperatorShell>
  );
}
