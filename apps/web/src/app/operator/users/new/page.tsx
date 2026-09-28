import { OperatorShell } from "@/components/operator/shell";
import { OperatorUserForm } from "@/components/operator/users";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorUserCreatePage() {
  const access = await requireOperatorPage("/operator/users/new");
  return (
    <OperatorShell {...access} activeSection="users">
      <OperatorUserForm />
    </OperatorShell>
  );
}
