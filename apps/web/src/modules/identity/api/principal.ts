import type { Account } from "@/modules/identity/account";
import type { Capability } from "@/modules/identity/capabilities";

export interface ApiKeyAuthenticator {
  authenticate(token: string): Promise<{ accountId: string; scopes: readonly string[] } | null>;
}

export interface AnonymousApiPrincipal {
  kind: "anonymous";
  accountId: null;
  account: null;
  capabilities: readonly [];
  scopes: ReadonlySet<string>;
}

export interface AuthenticatedApiPrincipal {
  accountId: string;
  account: Account;
  kind: "user_session" | "api_key";
  capabilities: readonly Capability[];
  scopes: ReadonlySet<string>;
}

/** One resolved caller identity for every API request, including anonymous callers. */
export type ApiPrincipal = AnonymousApiPrincipal | AuthenticatedApiPrincipal;
export type ApiPrincipalKind = AuthenticatedApiPrincipal["kind"];

export function isAuthenticatedPrincipal(
  principal: ApiPrincipal,
): principal is AuthenticatedApiPrincipal {
  return principal.kind !== "anonymous";
}
