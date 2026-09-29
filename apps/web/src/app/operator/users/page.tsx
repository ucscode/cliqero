import { OperatorShell } from "@/components/operator/shell";
import { OperatorUsersList } from "@/components/operator/users";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";

export default async function OperatorUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const access = await requireOperatorPage("/operator/users");
  const query = await searchParams;
  return (
    <OperatorShell {...access} activeSection="users">
      <OperatorUsersList
        canManage={hasCapability(access.capabilities, "accounts.manage")}
        deletedNotice={query.notice === "account-deleted"}
      />
    </OperatorShell>
  );
}
