import { OperatorShell } from "@/components/operator/shell";
import { OperatorUsersList } from "@/components/operator/users";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorUsersPage() {
  const access = await requireOperatorPage("/operator/users");
  return (
    <OperatorShell {...access} activeSection="users">
      <OperatorUsersList canManage={hasCapability(access.capabilities, "accounts.manage")} />
    </OperatorShell>
  );
}
