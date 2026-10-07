import { legacyRoutes } from "./compat/dispatch/routes";
import type { ApiPrincipal } from "@/modules/identity/api/principal";
import { apiAuthorizer, type AccessPolicy } from "./shared/authorization";
import type { ApplicationContainer } from "@/infrastructure/container";
import { withRequestPrincipal } from "./shared/request-principal";

type RouteContext = {
  params: Promise<Record<string, string>>;
  container?: ApplicationContainer;
};
type Handler = (request: Request, context?: RouteContext) => Response | Promise<Response>;
export type LegacyRouteAccess = AccessPolicy;

const publicMethods = new Set(["GET"]);
const publicPaths = new Set(["/api/health", "/api/listings", "/api/listings/:listingId"]);
const sessionOnlyPaths = new Set(["/api/listings/:listingId/access"]);

export function legacyRouteAccessForPattern(pattern: string, method: string): LegacyRouteAccess {
  if (pattern === "/api/accounts") return { mode: "anonymous", apiKey: "reject" };
  if (pattern === "/api/access/verify") return { mode: "integration_credential" };
  if (publicPaths.has(pattern) && publicMethods.has(method)) {
    return { mode: "anonymous", apiKey: "allow" };
  }
  if (sessionOnlyPaths.has(pattern)) return { mode: "session_only" };
  if (pattern.startsWith("/api/treasury"))
    return {
      mode: "account",
      scope: method === "GET" ? "treasury:read" : "treasury:manage",
      capability: "treasury.manage",
    };
  if (
    pattern.startsWith("/api/listings/") &&
    (pattern.includes("/integrations") || pattern.includes("/media"))
  )
    return { mode: "account" };
  if (pattern === "/api/listings/import" || pattern === "/api/listings/export")
    return { mode: "account", scope: "catalogue:manage", capability: "catalogue.manage" };
  if (pattern === "/api/purchases/reverse" || pattern === "/api/earnings/settlement")
    return { mode: "account", scope: "payments:manage", capability: "finance.manage" };
  if (pattern === "/api/distribution-policy")
    return { mode: "account", scope: "payments:read", capability: "finance.read" };
  if (pattern === "/api/listings/:listingId/referral-url")
    return { mode: "session_only", apiKey: "reject" };
  if (pattern === "/api/listings" || pattern === "/api/listings/:listingId")
    return method === "GET"
      ? { mode: "account", scope: "catalogue:read" }
      : { mode: "account", scope: "catalogue:manage", capability: "catalogue.manage" };
  if (pattern.startsWith("/api/listings/"))
    return { mode: "account", scope: "catalogue:manage", capability: "catalogue.manage" };
  if (pattern === "/api/wallet") return { mode: "account", scope: "wallet:read" };
  if (pattern === "/api/wallet/transactions") return { mode: "account", scope: "wallet:read" };
  if (pattern === "/api/wallet/transfer-quote")
    return { mode: "account", scope: "wallet:transfer" };
  if (pattern === "/api/wallet/transfers") return { mode: "account", scope: "wallet:transfer" };
  if (pattern === "/api/funding-transactions/:fundingId/cancel")
    return { mode: "account", scope: "wallet:fund" };
  if (pattern === "/api/funding-transactions/:fundingId/evidence")
    return { mode: "account", scope: "wallet:fund" };
  if (pattern === "/api/funding-transactions/:fundingId/initialize")
    return { mode: "account", scope: "wallet:fund" };
  if (pattern === "/api/funding-transactions/:fundingId/provider-transaction")
    return { mode: "account", scope: "wallet:fund" };
  if (pattern === "/api/funding-transactions/:fundingId/verify")
    return { mode: "account", scope: "wallet:fund" };
  if (pattern === "/api/checkouts")
    return { mode: "account", scope: method === "GET" ? "purchases:read" : "checkout:create" };
  if (pattern === "/api/checkout-quote") return { mode: "account", scope: "checkout:create" };
  if (pattern === "/api/checkouts/:checkoutId/pay")
    return { mode: "account", scope: "checkout:create" };
  if (pattern === "/api/checkouts/:checkoutId" || pattern.startsWith("/api/purchases"))
    return { mode: "account", scope: "purchases:read" };
  if (pattern.startsWith("/api/referrals/"))
    return {
      mode: "account",
      scope: pattern.endsWith("/parent") ? "referrals:manage" : "referrals:read",
    };
  if (pattern.startsWith("/api/earnings")) return { mode: "account", scope: "earnings:read" };
  if (pattern === "/api/withdrawals/policy") return { mode: "account", scope: "withdrawals:read" };
  if (pattern === "/api/withdrawal-methods") return { mode: "account", scope: "withdrawals:read" };
  if (pattern === "/api/withdrawal-destinations")
    return { mode: "account", scope: method === "GET" ? "withdrawals:read" : "withdrawals:create" };
  if (pattern === "/api/withdrawal-destinations/:destinationId")
    return {
      mode: "account",
      scope: method === "PATCH" ? "withdrawals:create" : "withdrawals:read",
    };
  if (pattern === "/api/withdrawals")
    return { mode: "account", scope: method === "GET" ? "withdrawals:read" : "withdrawals:create" };
  if (pattern === "/api/withdrawals/:withdrawalId")
    return {
      mode: "account",
      scope:
        method === "PATCH"
          ? "withdrawals:manage"
          : method === "GET"
            ? "withdrawals:read"
            : "withdrawals:create",
    };
  return { mode: "account" };
}

const escapedSegment = (segment: string) =>
  segment.startsWith(":") ? "([^/]+)" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matchRoute(pattern: string, pathname: string) {
  const names: string[] = [];
  const expression = pattern
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) names.push(segment.slice(1));
      return escapedSegment(segment);
    })
    .join("/");
  const match = new RegExp(`^${expression}/?$`).exec(pathname);
  if (!match) return null;
  return Object.fromEntries(
    names.map((name, index) => [name, decodeURIComponent(match[index + 1])]),
  );
}

export const legacyApiPaths = legacyRoutes.map(({ pattern, module }) => ({
  path: pattern.replace(/:([A-Za-z]+)/g, "{$1}"),
  methods: Object.keys(module)
    .filter((key) => ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(key))
    .map((method) => ({ method, access: legacyRouteAccessForPattern(pattern, method) })),
}));

export function getLegacyRouteAccess(pathname: string, method: string): LegacyRouteAccess | null {
  for (const route of legacyRoutes)
    if (matchRoute(route.pattern, pathname))
      return legacyRouteAccessForPattern(route.pattern, method);
  return null;
}

function unauthorized() {
  return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
}

function forbidden() {
  return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
}

export function authorizeLegacyRequest(
  request: Request,
  principal: ApiPrincipal | null,
  access: LegacyRouteAccess,
): Response | null {
  const failure = apiAuthorizer.authorize(principal, access, request.headers.has("authorization"));
  return failure === "unauthorized" ? unauthorized() : failure === "forbidden" ? forbidden() : null;
}

export async function dispatchLegacyApi(
  request: Request,
  principal: ApiPrincipal | null = null,
  container?: ApplicationContainer,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  for (const route of legacyRoutes) {
    const params = matchRoute(route.pattern, pathname);
    if (!params) continue;
    const access = legacyRouteAccessForPattern(route.pattern, request.method);
    const handler = route.module[request.method] as Handler | undefined;
    if (!handler)
      return Response.json(
        { error: "Method not allowed", code: "method_not_allowed" },
        { status: 405 },
      );
    const denied = authorizeLegacyRequest(request, principal, access);
    if (denied) return denied;
    const invoke = async () => handler(request, { params: Promise.resolve(params), container });
    return principal ? withRequestPrincipal(request, principal, invoke) : invoke();
  }
  return null;
}
