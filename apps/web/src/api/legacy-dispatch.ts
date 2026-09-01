import * as accessVerify from "@/api/compat/access/verify/route";
import * as accounts from "@/api/compat/accounts/route";
import * as checkout from "@/api/compat/checkout/route";
import * as checkoutById from "@/api/compat/checkout/[id]/route";
import * as earnings from "@/api/compat/earnings/route";
import * as earningsEntries from "@/api/compat/earnings/entries/route";
import * as developmentFundingVerify from "@/api/compat/funding/development/verify/route";
import * as health from "@/api/compat/health/route";
import * as integrations from "@/api/compat/integrations/route";
import * as integrationById from "@/api/compat/integrations/[id]/route";
import * as integrationRotate from "@/api/compat/integrations/[id]/rotate/route";
import * as listings from "@/api/compat/listings/route";
import * as listingById from "@/api/compat/listings/[id]/route";
import * as listingAccess from "@/api/compat/listings/[id]/access/route";
import * as listingMedia from "@/api/compat/listings/[id]/media/route";
import * as listingMediaById from "@/api/compat/listings/[id]/media/[mediaId]/route";
import * as listingPublish from "@/api/compat/listings/[id]/publish/route";
import * as listingReferralLink from "@/api/compat/listings/[id]/referral-link/route";
import * as listingRestore from "@/api/compat/listings/[id]/restore/route";
import * as listingExport from "@/api/compat/listings/export/route";
import * as listingImport from "@/api/compat/listings/import/route";
import * as myListings from "@/api/compat/me/listings/route";
import * as onboarding from "@/api/compat/me/onboarding/route";
import * as profile from "@/api/compat/me/profile/route";
import * as operatorDistributionPolicy from "@/api/compat/operator/distribution-policy/route";
import * as operatorListings from "@/api/compat/operator/listings/route";
import * as operatorListingById from "@/api/compat/operator/listings/[id]/route";
import * as operatorListingMedia from "@/api/compat/operator/listings/[id]/media/route";
import * as operatorListingMediaById from "@/api/compat/operator/listings/[id]/media/[mediaId]/route";
import * as operatorListingPublish from "@/api/compat/operator/listings/[id]/publish/route";
import * as operatorListingRestore from "@/api/compat/operator/listings/[id]/restore/route";
import * as operatorListingExport from "@/api/compat/operator/listings/export/route";
import * as operatorListingImport from "@/api/compat/operator/listings/import/route";
import * as operatorPaystackEvents from "@/api/compat/operator/paystack/events/route";
import * as operatorPaystackReconcile from "@/api/compat/operator/paystack/reconcile/route";
import * as operatorPurchaseReverse from "@/api/compat/operator/purchases/reverse/route";
import * as operatorSettlement from "@/api/compat/operator/settlement/route";
import * as operatorTreasury from "@/api/compat/operator/treasury/route";
import * as operatorTreasuryEntries from "@/api/compat/operator/treasury/entries/route";
import * as operatorTreasuryEntry from "@/api/compat/operator/treasury/entries/[id]/route";
import * as operatorTreasuryExpenses from "@/api/compat/operator/treasury/expenses/route";
import * as operatorWithdrawals from "@/api/compat/operator/withdrawals/route";
import * as operatorWithdrawal from "@/api/compat/operator/withdrawals/[id]/route";
import * as operatorWithdrawalApprove from "@/api/compat/operator/withdrawals/[id]/approve/route";
import * as operatorWithdrawalComplete from "@/api/compat/operator/withdrawals/[id]/complete/route";
import * as operatorWithdrawalPayout from "@/api/compat/operator/withdrawals/[id]/payout/route";
import * as operatorWithdrawalPayoutReconcile from "@/api/compat/operator/withdrawals/[id]/payout/reconcile/route";
import * as operatorWithdrawalReject from "@/api/compat/operator/withdrawals/[id]/reject/route";
import * as purchases from "@/api/compat/purchases/route";
import * as purchaseById from "@/api/compat/purchases/[id]/route";
import * as referralLinks from "@/api/compat/referral-links/route";
import * as referralLinkById from "@/api/compat/referral-links/[id]/route";
import * as referralDirect from "@/api/compat/referrals/direct/route";
import * as referralDownline from "@/api/compat/referrals/downline/route";
import * as referralParent from "@/api/compat/referrals/parent/route";
import * as referralUplines from "@/api/compat/referrals/uplines/route";
import * as wallet from "@/api/compat/wallet/route";
import * as walletFunding from "@/api/compat/wallet/fund/route";
import * as walletFundingById from "@/api/compat/wallet/fund/[id]/route";
import * as walletTransactions from "@/api/compat/wallet/transactions/route";
import * as withdrawals from "@/api/compat/withdrawals/route";
import * as withdrawalById from "@/api/compat/withdrawals/[id]/route";
import * as withdrawalPolicy from "@/api/compat/withdrawals/policy/route";
import type { ApiPrincipal } from "@/modules/identity/api-principal";
import type { ApiScope } from "@/modules/identity/api-scopes";

type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (request: Request, context?: RouteContext) => Response | Promise<Response>;
type RouteModule = Record<string, unknown>;

type LegacyRoute = {
  pattern: string;
  module: RouteModule;
};

export type LegacyAuthMode = "anonymous" | "account" | "session_only" | "integration_credential";
export type LegacyRouteAccess = {
  mode: LegacyAuthMode;
  scope?: ApiScope;
  apiKey?: "allow" | "reject";
  allowIncompleteSession?: boolean;
};

const routes: LegacyRoute[] = [
  { pattern: "/api/access/verify", module: accessVerify },
  { pattern: "/api/accounts", module: accounts },
  { pattern: "/api/checkout/:id", module: checkoutById },
  { pattern: "/api/checkout", module: checkout },
  { pattern: "/api/earnings/entries", module: earningsEntries },
  { pattern: "/api/earnings", module: earnings },
  { pattern: "/api/funding/development/verify", module: developmentFundingVerify },
  { pattern: "/api/health", module: health },
  { pattern: "/api/integrations/:id/rotate", module: integrationRotate },
  { pattern: "/api/integrations/:id", module: integrationById },
  { pattern: "/api/integrations", module: integrations },
  { pattern: "/api/listings/:id/media/:mediaId", module: listingMediaById },
  { pattern: "/api/listings/:id/media", module: listingMedia },
  { pattern: "/api/listings/:id/access", module: listingAccess },
  { pattern: "/api/listings/:id/publish", module: listingPublish },
  { pattern: "/api/listings/:id/referral-link", module: listingReferralLink },
  { pattern: "/api/listings/:id/restore", module: listingRestore },
  { pattern: "/api/listings/export", module: listingExport },
  { pattern: "/api/listings/import", module: listingImport },
  { pattern: "/api/listings/:id", module: listingById },
  { pattern: "/api/listings", module: listings },
  { pattern: "/api/me/listings", module: myListings },
  { pattern: "/api/me/onboarding", module: onboarding },
  { pattern: "/api/me/profile", module: profile },
  { pattern: "/api/operator/distribution-policy", module: operatorDistributionPolicy },
  { pattern: "/api/operator/listings/:id/media/:mediaId", module: operatorListingMediaById },
  { pattern: "/api/operator/listings/:id/media", module: operatorListingMedia },
  { pattern: "/api/operator/listings/:id/publish", module: operatorListingPublish },
  { pattern: "/api/operator/listings/:id/restore", module: operatorListingRestore },
  { pattern: "/api/operator/listings/export", module: operatorListingExport },
  { pattern: "/api/operator/listings/import", module: operatorListingImport },
  { pattern: "/api/operator/listings/:id", module: operatorListingById },
  { pattern: "/api/operator/listings", module: operatorListings },
  { pattern: "/api/operator/paystack/events", module: operatorPaystackEvents },
  { pattern: "/api/operator/paystack/reconcile", module: operatorPaystackReconcile },
  { pattern: "/api/operator/purchases/reverse", module: operatorPurchaseReverse },
  { pattern: "/api/operator/settlement", module: operatorSettlement },
  { pattern: "/api/operator/treasury/entries/:id", module: operatorTreasuryEntry },
  { pattern: "/api/operator/treasury/entries", module: operatorTreasuryEntries },
  { pattern: "/api/operator/treasury/expenses", module: operatorTreasuryExpenses },
  { pattern: "/api/operator/treasury", module: operatorTreasury },
  { pattern: "/api/operator/withdrawals/:id/approve", module: operatorWithdrawalApprove },
  { pattern: "/api/operator/withdrawals/:id/complete", module: operatorWithdrawalComplete },
  {
    pattern: "/api/operator/withdrawals/:id/payout/reconcile",
    module: operatorWithdrawalPayoutReconcile,
  },
  { pattern: "/api/operator/withdrawals/:id/payout", module: operatorWithdrawalPayout },
  { pattern: "/api/operator/withdrawals/:id/reject", module: operatorWithdrawalReject },
  { pattern: "/api/operator/withdrawals/:id", module: operatorWithdrawal },
  { pattern: "/api/operator/withdrawals", module: operatorWithdrawals },
  { pattern: "/api/purchases/:id", module: purchaseById },
  { pattern: "/api/purchases", module: purchases },
  { pattern: "/api/referral-links/:id", module: referralLinkById },
  { pattern: "/api/referral-links", module: referralLinks },
  { pattern: "/api/referrals/direct", module: referralDirect },
  { pattern: "/api/referrals/downline", module: referralDownline },
  { pattern: "/api/referrals/parent", module: referralParent },
  { pattern: "/api/referrals/uplines", module: referralUplines },
  { pattern: "/api/wallet/fund", module: walletFunding },
  { pattern: "/api/wallet/fund/:id", module: walletFundingById },
  { pattern: "/api/wallet/transactions", module: walletTransactions },
  { pattern: "/api/wallet", module: wallet },
  { pattern: "/api/withdrawals/policy", module: withdrawalPolicy },
  { pattern: "/api/withdrawals/:id", module: withdrawalById },
  { pattern: "/api/withdrawals", module: withdrawals },
];

const publicMethods = new Set(["GET"]);
const publicPaths = new Set(["/api/health", "/api/listings", "/api/listings/:id"]);
const sessionOnlyPaths = new Set([
  "/api/funding/development/verify",
  "/api/listings/:id/access",
  "/api/integrations",
  "/api/integrations/:id",
  "/api/integrations/:id/rotate",
  "/api/me/onboarding",
  "/api/me/profile",
]);

function routeAccess(pattern: string, method: string): LegacyRouteAccess {
  if (pattern === "/api/accounts") return { mode: "anonymous", apiKey: "reject" };
  if (pattern === "/api/access/verify") return { mode: "integration_credential" };
  if (publicPaths.has(pattern) && publicMethods.has(method)) {
    return { mode: "anonymous", apiKey: "allow" };
  }
  if (pattern === "/api/me/onboarding")
    return { mode: "session_only", apiKey: "reject", allowIncompleteSession: true };
  if (sessionOnlyPaths.has(pattern)) return { mode: "session_only" };
  if (pattern.startsWith("/api/operator/treasury")) {
    return { mode: "account", scope: method === "GET" ? "treasury:read" : "treasury:manage" };
  }
  if (pattern.startsWith("/api/operator/listings"))
    return { mode: "account", scope: "catalogue:manage" };
  if (pattern.startsWith("/api/operator/")) return { mode: "account", scope: "operations:manage" };
  if (pattern === "/api/listings/:id/referral-link")
    return { mode: "account", scope: "referrals:manage" };
  if (pattern === "/api/listings" || pattern === "/api/listings/:id")
    return { mode: "account", scope: "catalogue:manage" };
  if (pattern.startsWith("/api/listings/")) return { mode: "account", scope: "catalogue:manage" };
  if (pattern === "/api/me/listings") return { mode: "account", scope: "catalogue:read" };
  if (pattern === "/api/wallet") return { mode: "account", scope: "wallet:read" };
  if (pattern === "/api/wallet/transactions") return { mode: "account", scope: "wallet:read" };
  if (pattern === "/api/wallet/fund/:id") return { mode: "account", scope: "wallet:read" };
  if (pattern === "/api/wallet/fund") return { mode: "account", scope: "wallet:fund" };
  if (pattern === "/api/checkout") return { mode: "account", scope: "checkout:create" };
  if (pattern === "/api/checkout/:id" || pattern.startsWith("/api/purchases"))
    return { mode: "account", scope: "purchases:read" };
  if (pattern.startsWith("/api/referrals/"))
    return {
      mode: "account",
      scope: pattern.endsWith("/parent") ? "referrals:manage" : "referrals:read",
    };
  if (pattern.startsWith("/api/referral-links"))
    return { mode: "account", scope: method === "GET" ? "referrals:read" : "referrals:manage" };
  if (pattern.startsWith("/api/earnings")) return { mode: "account", scope: "earnings:read" };
  if (pattern === "/api/withdrawals/policy") return { mode: "account", scope: "withdrawals:read" };
  if (pattern === "/api/withdrawals")
    return { mode: "account", scope: method === "GET" ? "withdrawals:read" : "withdrawals:create" };
  if (pattern === "/api/withdrawals/:id")
    return {
      mode: "account",
      scope: method === "DELETE" ? "withdrawals:manage" : "withdrawals:read",
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

export const legacyApiPaths = routes.map(({ pattern, module }) => ({
  path: pattern.replace(/:([A-Za-z]+)/g, "{$1}"),
  methods: Object.keys(module)
    .filter((key) => ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(key))
    .map((method) => ({ method, access: routeAccess(pattern, method) })),
}));

export function getLegacyRouteAccess(pathname: string, method: string): LegacyRouteAccess | null {
  for (const route of routes)
    if (matchRoute(route.pattern, pathname)) return routeAccess(route.pattern, method);
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
  if (
    access.mode !== "integration_credential" &&
    request.headers.has("authorization") &&
    !principal
  )
    return unauthorized();
  if (access.mode === "session_only" && !principal && !access.allowIncompleteSession)
    return unauthorized();
  if (access.mode === "session_only" && principal?.kind === "api_key") return forbidden();
  if (access.mode === "anonymous" && principal?.kind === "api_key" && access.apiKey === "reject")
    return forbidden();
  if (access.mode === "account" && !principal) return unauthorized();
  if (
    access.mode === "account" &&
    principal?.kind === "api_key" &&
    access.scope &&
    !principal.scopes.has(access.scope)
  )
    return forbidden();
  return null;
}

export async function dispatchLegacyApi(
  request: Request,
  principal: ApiPrincipal | null = null,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  for (const route of routes) {
    const params = matchRoute(route.pattern, pathname);
    if (!params) continue;
    const access = routeAccess(route.pattern, request.method);
    const handler = route.module[request.method] as Handler | undefined;
    if (!handler)
      return Response.json(
        { error: "Method not allowed", code: "method_not_allowed" },
        { status: 405 },
      );
    const denied = authorizeLegacyRequest(request, principal, access);
    if (denied) return denied;
    return handler(request, { params: Promise.resolve(params) });
  }
  return null;
}
