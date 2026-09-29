import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import { isAuthenticatedPrincipal, type ApiPrincipal } from "@/modules/identity/api/principal";
import type { ApiScope } from "@/modules/identity/api/scopes";

export type AccessPolicy = {
  mode: "anonymous" | "account" | "session_only" | "integration_credential" | "deny";
  capability?: Capability;
  scope?: ApiScope;
  apiKey?: "allow" | "reject";
  allowIncompleteSession?: boolean;
};

/** Shared policy evaluator used by both Hono handlers and compatibility adapters. */
export class ApiAuthorizer {
  authorize(
    principal: ApiPrincipal | null,
    policy: AccessPolicy,
    hasAuthorizationHeader = false,
  ): "unauthorized" | "forbidden" | null {
    if (policy.mode === "deny") return "forbidden";
    const authenticated = principal !== null && isAuthenticatedPrincipal(principal);
    if (policy.mode !== "integration_credential" && hasAuthorizationHeader && !authenticated)
      return "unauthorized";
    if (policy.mode === "session_only" && !authenticated && !policy.allowIncompleteSession)
      return "unauthorized";
    if (policy.mode === "session_only" && principal?.kind === "api_key") return "forbidden";
    if (policy.mode === "anonymous" && principal?.kind === "api_key" && policy.apiKey === "reject")
      return "forbidden";
    if (policy.mode === "account" && !authenticated) return "unauthorized";
    if (
      policy.capability &&
      authenticated &&
      !hasCapability(principal.capabilities, policy.capability)
    )
      return "forbidden";
    if (policy.scope && principal?.kind === "api_key" && !principal.scopes.has(policy.scope))
      return "forbidden";
    return null;
  }
}

export const apiAuthorizer = new ApiAuthorizer();
