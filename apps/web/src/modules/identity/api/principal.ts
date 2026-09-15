import type { Account } from "@/modules/identity/account";
import type { Capability } from "@/modules/identity/capabilities";

export interface ApiKeyAuthenticator {
  authenticate(token: string): Promise<{ accountId: string; scopes: readonly string[] } | null>;
}

export type ApiPrincipalKind = "user_session" | "api_key";

export interface ApiPrincipal {
  accountId: string;
  account: Account;
  kind: ApiPrincipalKind;
  capabilities: readonly Capability[];
  scopes: ReadonlySet<string>;
}
