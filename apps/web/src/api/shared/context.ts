import type { Context } from "hono";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import { operatorCapabilitiesForScope, type ApiScope } from "@/modules/identity/api/scopes";
import {
  isAuthenticatedPrincipal,
  type ApiPrincipal,
  type AuthenticatedApiPrincipal,
} from "@/modules/identity/api/principal";
import { apiAuthorizer, type AccessPolicy } from "./authorization";

export type Env = { Variables: { principal: ApiPrincipal } };
export type ApiContext = Context<Env>;

export function principal(c: ApiContext): ApiPrincipal {
  return c.get("principal");
}

export function requirePrincipal(c: ApiContext) {
  const value = principal(c);
  if (!isAuthenticatedPrincipal(value)) {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized", code: "unauthorized" }, 401) as never;
  }
  return value;
}

export function authorize(c: ApiContext, policy: AccessPolicy) {
  const failure = apiAuthorizer.authorize(
    principal(c),
    policy,
    c.req.header("authorization") !== undefined,
  );
  if (failure === "unauthorized") {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized", code: "unauthorized" }, 401) as never;
  }
  return failure === "forbidden"
    ? (c.json({ error: "Forbidden", code: "forbidden" }, 403) as never)
    : null;
}

export function requireScope(c: ApiContext, value: AuthenticatedApiPrincipal, scope: ApiScope) {
  return authorize(c, { mode: "account", scope });
}

export function requireCapabilityScope(
  c: ApiContext,
  value: AuthenticatedApiPrincipal,
  capability: Capability,
  scope: ApiScope,
) {
  return authorize(c, { mode: "account", capability, scope });
}

export function requireSessionCapability(
  c: ApiContext,
  value: AuthenticatedApiPrincipal,
  capability: Capability,
) {
  return authorize(c, { mode: "session_only", capability });
}

export function hierarchyReadOrAdmin(c: ApiContext, value: AuthenticatedApiPrincipal) {
  if (value.kind === "api_key" && value.scopes.has("hierarchy:admin")) return null;
  return requireScope(c, value, "hierarchy:read");
}

export function grantableScopes(value: AuthenticatedApiPrincipal): Set<string> {
  const allowed = new Set([
    "hierarchy:read",
    "catalogue:read",
    "wallet:read",
    "wallet:fund",
    "wallet:transfer",
    "checkout:create",
    "purchases:read",
    "referrals:read",
    "referrals:manage",
    "earnings:read",
    "withdrawals:read",
    "withdrawals:create",
  ]);
  if (hasCapability(value.capabilities, "catalogue.manage")) allowed.add("catalogue:manage");
  if (hasCapability(value.capabilities, "accounts.manage")) allowed.add("accounts:manage");
  if (hasCapability(value.capabilities, "accounts.read")) allowed.add("accounts:read");
  if (hasCapability(value.capabilities, "hierarchy.manage")) allowed.add("hierarchy:admin");
  if (hasCapability(value.capabilities, "withdrawals.manage")) allowed.add("withdrawals:manage");
  if (hasCapability(value.capabilities, "finance.read")) allowed.add("payments:read");
  if (hasCapability(value.capabilities, "finance.manage")) allowed.add("payments:manage");
  if (hasCapability(value.capabilities, "treasury.manage")) {
    allowed.add("treasury:read");
    allowed.add("treasury:manage");
  }
  if (
    operatorCapabilitiesForScope("operations:manage").every((capability) =>
      hasCapability(value.capabilities, capability),
    )
  )
    allowed.add("operations:manage");
  if (hasCapability(value.capabilities, "content.manage"))
    for (const scope of ["blog:read", "blog:write", "blog:publish", "blog:manage"])
      allowed.add(scope);
  if (hasCapability(value.capabilities, "reviews.moderate")) allowed.add("reviews:moderate");
  return allowed;
}
