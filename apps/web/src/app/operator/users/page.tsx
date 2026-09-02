import { OperatorShell } from "@/components/operator-shell";
import { OperatorUsersList } from "@/components/operator-users";
import { requireOperatorPage } from "../operator-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorUsersPage() {
  const access = await requireOperatorPage("/operator/users");
  if (access.role !== "operator") redirect("/operator");
  return (
    <OperatorShell {...access} activeSection="users" title="Users">
      <OperatorUsersList />
    </OperatorShell>
  );
}
