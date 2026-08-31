import * as accessVerify from "@/app/api/access/verify/route";
import * as accounts from "@/app/api/accounts/route";
import * as authSessions from "@/app/api/auth/sessions/route";
import * as checkout from "@/app/api/checkout/route";
import * as checkoutById from "@/app/api/checkout/[id]/route";
import * as earnings from "@/app/api/earnings/route";
import * as earningsEntries from "@/app/api/earnings/entries/route";
import * as developmentFundingVerify from "@/app/api/funding/development/verify/route";
import * as health from "@/app/api/health/route";
import * as integrations from "@/app/api/integrations/route";
import * as integrationById from "@/app/api/integrations/[id]/route";
import * as integrationRotate from "@/app/api/integrations/[id]/rotate/route";
import * as listings from "@/app/api/listings/route";
import * as listingById from "@/app/api/listings/[id]/route";
import * as listingMedia from "@/app/api/listings/[id]/media/route";
import * as listingMediaById from "@/app/api/listings/[id]/media/[mediaId]/route";
import * as listingPublish from "@/app/api/listings/[id]/publish/route";
import * as listingReferralLink from "@/app/api/listings/[id]/referral-link/route";
import * as listingRestore from "@/app/api/listings/[id]/restore/route";
import * as listingExport from "@/app/api/listings/export/route";
import * as listingImport from "@/app/api/listings/import/route";
import * as myListings from "@/app/api/me/listings/route";
import * as onboarding from "@/app/api/me/onboarding/route";
import * as profile from "@/app/api/me/profile/route";
import * as operatorDistributionPolicy from "@/app/api/operator/distribution-policy/route";
import * as operatorListings from "@/app/api/operator/listings/route";
import * as operatorListingById from "@/app/api/operator/listings/[id]/route";
import * as operatorListingMedia from "@/app/api/operator/listings/[id]/media/route";
import * as operatorListingMediaById from "@/app/api/operator/listings/[id]/media/[mediaId]/route";
import * as operatorListingPublish from "@/app/api/operator/listings/[id]/publish/route";
import * as operatorListingRestore from "@/app/api/operator/listings/[id]/restore/route";
import * as operatorListingExport from "@/app/api/operator/listings/export/route";
import * as operatorListingImport from "@/app/api/operator/listings/import/route";
import * as operatorPaystackEvents from "@/app/api/operator/paystack/events/route";
import * as operatorPaystackReconcile from "@/app/api/operator/paystack/reconcile/route";
import * as operatorPurchaseReverse from "@/app/api/operator/purchases/reverse/route";
import * as operatorSettlement from "@/app/api/operator/settlement/route";
import * as operatorTreasury from "@/app/api/operator/treasury/route";
import * as operatorTreasuryEntries from "@/app/api/operator/treasury/entries/route";
import * as operatorTreasuryEntry from "@/app/api/operator/treasury/entries/[id]/route";
import * as operatorTreasuryExpenses from "@/app/api/operator/treasury/expenses/route";
import * as operatorWithdrawals from "@/app/api/operator/withdrawals/route";
import * as operatorWithdrawal from "@/app/api/operator/withdrawals/[id]/route";
import * as operatorWithdrawalApprove from "@/app/api/operator/withdrawals/[id]/approve/route";
import * as operatorWithdrawalComplete from "@/app/api/operator/withdrawals/[id]/complete/route";
import * as operatorWithdrawalPayout from "@/app/api/operator/withdrawals/[id]/payout/route";
import * as operatorWithdrawalPayoutReconcile from "@/app/api/operator/withdrawals/[id]/payout/reconcile/route";
import * as operatorWithdrawalReject from "@/app/api/operator/withdrawals/[id]/reject/route";
import * as purchases from "@/app/api/purchases/route";
import * as purchaseById from "@/app/api/purchases/[id]/route";
import * as referralLinks from "@/app/api/referral-links/route";
import * as referralLinkById from "@/app/api/referral-links/[id]/route";
import * as referralDirect from "@/app/api/referrals/direct/route";
import * as referralDownline from "@/app/api/referrals/downline/route";
import * as referralParent from "@/app/api/referrals/parent/route";
import * as referralUplines from "@/app/api/referrals/uplines/route";
import * as wallet from "@/app/api/wallet/route";
import * as walletFunding from "@/app/api/wallet/fund/route";
import * as walletTransactions from "@/app/api/wallet/transactions/route";
import * as withdrawals from "@/app/api/withdrawals/route";
import * as withdrawalById from "@/app/api/withdrawals/[id]/route";

type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (request: Request, context?: RouteContext) => Response | Promise<Response>;
type RouteModule = Record<string, unknown>;

type LegacyRoute = {
  pattern: string;
  module: RouteModule;
};

const routes: LegacyRoute[] = [
  { pattern: "/api/access/verify", module: accessVerify },
  { pattern: "/api/accounts", module: accounts },
  { pattern: "/api/auth/sessions", module: authSessions },
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
  { pattern: "/api/listings/:id/publish", module: listingPublish },
  { pattern: "/api/listings/:id/referral-link", module: listingReferralLink },
  { pattern: "/api/listings/:id/restore", module: listingRestore },
  { pattern: "/api/listings/:id", module: listingById },
  { pattern: "/api/listings/export", module: listingExport },
  { pattern: "/api/listings/import", module: listingImport },
  { pattern: "/api/listings", module: listings },
  { pattern: "/api/me/listings", module: myListings },
  { pattern: "/api/me/onboarding", module: onboarding },
  { pattern: "/api/me/profile", module: profile },
  { pattern: "/api/operator/distribution-policy", module: operatorDistributionPolicy },
  { pattern: "/api/operator/listings/:id/media/:mediaId", module: operatorListingMediaById },
  { pattern: "/api/operator/listings/:id/media", module: operatorListingMedia },
  { pattern: "/api/operator/listings/:id/publish", module: operatorListingPublish },
  { pattern: "/api/operator/listings/:id/restore", module: operatorListingRestore },
  { pattern: "/api/operator/listings/:id", module: operatorListingById },
  { pattern: "/api/operator/listings/export", module: operatorListingExport },
  { pattern: "/api/operator/listings/import", module: operatorListingImport },
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
  { pattern: "/api/wallet/transactions", module: walletTransactions },
  { pattern: "/api/wallet", module: wallet },
  { pattern: "/api/withdrawals/:id", module: withdrawalById },
  { pattern: "/api/withdrawals", module: withdrawals },
];

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
  methods: Object.keys(module).filter((key) =>
    ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(key),
  ),
}));

export async function dispatchLegacyApi(request: Request): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  for (const route of routes) {
    const params = matchRoute(route.pattern, pathname);
    if (!params) continue;
    const handler = route.module[request.method] as Handler | undefined;
    if (!handler)
      return Response.json(
        { error: "Method not allowed", code: "method_not_allowed" },
        { status: 405 },
      );
    return handler(request, { params: Promise.resolve(params) });
  }
  return null;
}
