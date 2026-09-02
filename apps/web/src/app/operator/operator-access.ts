import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/infrastructure/container";

export type OperatorRole = "operator" | "catalogue_manager";

export async function requireOperatorPage(pathname: string) {
  const requestHeaders = await headers();
  const principal = await getContainer().principalResolver.resolve(
    new Request(`http://localhost${pathname}`, { headers: new Headers(requestHeaders) }),
  );
  if (!principal) redirect(`/login?next=${encodeURIComponent(pathname)}`);
  const role = principal.roles.includes("operator")
    ? "operator"
    : principal.roles.includes("catalogue_manager")
      ? "catalogue_manager"
      : null;
  if (!role) redirect("/dashboard");
  return { role, handle: principal.account.handle, email: principal.account.email } satisfies {
    role: OperatorRole;
    handle: string;
    email: string;
  };
}
