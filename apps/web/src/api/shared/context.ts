import type { Context } from "hono";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import { operatorCapabilitiesForScope } from "@/modules/identity/api/scopes";
import type { ApiPrincipal } from "@/modules/identity/api/principal";

export type Env = { Variables: { principal: ApiPrincipal | null } };
export type ApiContext = Context<Env>;

export function principal(c: ApiContext): ApiPrincipal | null {
  return c.get("principal");
}

export function requirePrincipal(c: ApiContext) {
  const value = principal(c);
  if (!value) {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized", code: "unauthorized" }, 401) as never;
  }
  return value;
}

export function requireScope(c: ApiContext, value: ApiPrincipal, scope: string) {
  if (value.kind === "api_key" && !value.scopes.has(scope))
    return c.json({ error: "Forbidden", code: "insufficient_scope" }, 403) as never;
  return null;
}

export function requireCapabilityScope(
  c: ApiContext,
  value: ApiPrincipal,
  capability: Capability,
  scope: string,
) {
  if (!hasCapability(value.capabilities, capability))
    return c.json({ error: "Forbidden", code: "forbidden" }, 403) as never;
  return requireScope(c, value, scope);
}

export function requireSessionCapability(
  c: ApiContext,
  value: ApiPrincipal,
  capability: Capability,
) {
  if (value.kind !== "user_session")
    return c.json(
      { error: "A browser session is required.", code: "session_required" },
      403,
    ) as never;
  if (!hasCapability(value.capabilities, capability))
    return c.json({ error: "Forbidden", code: "forbidden" }, 403) as never;
  return null;
}

export function hierarchyReadOrAdmin(c: ApiContext, value: ApiPrincipal) {
  if (value.kind === "api_key" && value.scopes.has("hierarchy:admin")) return null;
  return requireScope(c, value, "hierarchy:read");
}

export function grantableScopes(value: ApiPrincipal): Set<string> {
  const allowed = new Set([
    "hierarchy:read",
    "api_keys:manage",
    "catalogue:read",
    "wallet:read",
    "wallet:fund",
    "checkout:create",
    "purchases:read",
    "referrals:read",
    "referrals:manage",
    "earnings:read",
    "withdrawals:read",
    "withdrawals:create",
  ]);
  if (hasCapability(value.capabilities, "catalogue.manage")) allowed.add("catalogue:manage");
  if (hasCapability(value.capabilities, "hierarchy.manage")) allowed.add("hierarchy:admin");
  if (hasCapability(value.capabilities, "withdrawals.manage")) allowed.add("withdrawals:manage");
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
