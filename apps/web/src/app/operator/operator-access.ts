import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getContainer } from "@/infrastructure/container";
import { canAccessOperator, hasCapability, type Capability } from "@/modules/identity/capabilities";

export type OperatorPageAccess = {
  capabilities: readonly Capability[];
  accountId: string;
  username: string;
  email: string | null;
};

function capabilityForPath(pathname: string): Capability | null {
  if (pathname.startsWith("/operator/catalogue")) return "catalogue.manage";
  if (pathname.startsWith("/operator/blog")) return "content.manage";
  if (pathname.startsWith("/operator/users")) return "accounts.read";
  if (pathname.startsWith("/operator/network")) return "hierarchy.manage";
  if (pathname.startsWith("/operator/funding")) return "finance.read";
  if (pathname.startsWith("/operator/distributions")) return "finance.read";
  if (pathname.startsWith("/operator/earnings")) return "finance.read";
  if (pathname.startsWith("/operator/withdrawals")) return "withdrawals.manage";
  if (pathname.startsWith("/operator/treasury")) return "treasury.manage";
  if (pathname.startsWith("/operator/reviews")) return "reviews.moderate";
  return null;
}

export async function requireOperatorPage(pathname: string): Promise<OperatorPageAccess> {
  const requestHeaders = await headers();
  const principal = await getContainer().principalResolver.resolve(
    new Request(`http://localhost${pathname}`, { headers: new Headers(requestHeaders) }),
  );
  if (!principal) redirect(`/login?next=${encodeURIComponent(pathname)}`);
  const required = capabilityForPath(pathname);
  if (!required && !canAccessOperator(principal.capabilities)) redirect("/dashboard");
  if (required && !hasCapability(principal.capabilities, required)) redirect("/operator");
  const profile = await getContainer().profiles.get(principal.account.id);
  return {
    capabilities: principal.capabilities,
    accountId: principal.account.id,
    username: principal.account.username,
    email: profile.email,
  };
}
