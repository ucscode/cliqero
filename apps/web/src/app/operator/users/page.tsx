import { OperatorShell } from "@/components/operator-shell";
import { OperatorUsersList } from "@/components/operator-users";
import { requireOperatorPage } from "../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorUsersPage() {
  const access = await requireOperatorPage("/operator/users");
  return (
    <OperatorShell {...access} activeSection="users" title="Users">
      <OperatorUsersList />
    </OperatorShell>
  );
}
