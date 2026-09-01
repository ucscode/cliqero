import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/infrastructure/container";
import { OperatorShell } from "@/components/operator-shell";

export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  const requestHeaders = await headers();
  const principal = await getContainer().principalResolver.resolve(
    new Request("http://localhost/operator", { headers: new Headers(requestHeaders) }),
  );
  if (!principal) redirect("/login?next=%2Foperator");
  const role = principal.roles.includes("operator")
    ? "operator"
    : principal.roles.includes("catalogue_manager")
      ? "catalogue_manager"
      : null;
  if (!role) redirect("/dashboard");
  return (
    <OperatorShell role={role} handle={principal.account.handle} email={principal.account.email} />
  );
}
