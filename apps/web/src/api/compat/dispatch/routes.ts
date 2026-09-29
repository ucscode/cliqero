import * as accessVerify from "@/api/compat/access/verify/route";
import * as accounts from "@/api/compat/accounts/route";
import * as checkout from "@/api/compat/checkout/route";
import * as checkoutById from "@/api/compat/checkout/[id]/route";
import * as checkoutPay from "@/api/compat/checkout/[id]/pay/route";
import * as earnings from "@/api/compat/earnings/route";
import * as earningsEntries from "@/api/compat/earnings/entries/route";
import * as developmentFundingVerify from "@/api/compat/funding/development/verify/route";
import * as health from "@/api/compat/health/route";
import * as listings from "@/api/compat/listings/route";
import * as listingById from "@/api/compat/listings/[id]/route";
import * as listingAccess from "@/api/compat/listings/[id]/access/route";
import * as listingIntegrations from "@/api/compat/listings/[listingId]/integrations/route";
import * as listingIntegration from "@/api/compat/listings/[listingId]/integrations/[integrationId]/route";
import * as listingIntegrationRotate from "@/api/compat/listings/[listingId]/integrations/[integrationId]/rotate/route";
import * as listingMedia from "@/api/compat/listings/[id]/media/route";
import * as listingMediaById from "@/api/compat/listings/[id]/media/[mediaId]/route";
import * as listingReferralUrl from "@/api/compat/listings/[id]/referral-url/route";
import * as listingExport from "@/api/compat/listings/export/route";
import * as listingImport from "@/api/compat/listings/import/route";
import * as myListings from "@/api/compat/me/listings/route";
import * as onboarding from "@/api/compat/me/onboarding/route";
import * as profile from "@/api/compat/me/profile/route";
import * as distributionPolicy from "@/api/compat/distribution-policy/route";
import * as purchaseReverse from "@/api/compat/purchases/reverse/route";
import * as earningsSettlement from "@/api/compat/earnings/settlement/route";
import * as treasury from "@/api/compat/treasury/route";
import * as treasuryEntries from "@/api/compat/treasury/entries/route";
import * as treasuryEntry from "@/api/compat/treasury/entries/[id]/route";
import * as treasuryExpenses from "@/api/compat/treasury/expenses/route";
import * as passwordReset from "@/api/compat/password-reset/route";
import * as passwordResetRequest from "@/api/compat/password-reset/request/route";
import * as purchases from "@/api/compat/purchases/route";
import * as purchaseById from "@/api/compat/purchases/[id]/route";
import * as referralDirect from "@/api/compat/referrals/direct/route";
import * as referralAccountUrl from "@/api/compat/referrals/account-url/route";
import * as referralDownline from "@/api/compat/referrals/downline/route";
import * as referralParent from "@/api/compat/referrals/parent/route";
import * as referralUplines from "@/api/compat/referrals/uplines/route";
import * as wallet from "@/api/compat/wallet/route";
import * as walletFunding from "@/api/compat/wallet/fund/route";
import * as walletFundingById from "@/api/compat/wallet/fund/[id]/route";
import * as walletFundingCancel from "@/api/compat/wallet/fund/[id]/cancel/route";
import * as walletFundingEvidence from "@/api/compat/wallet/fund/[id]/evidence/route";
import * as walletFundingInitialize from "@/api/compat/wallet/fund/[id]/initialize/route";
import * as walletFundingTransaction from "@/api/compat/wallet/fund/[id]/transaction/route";
import * as walletFundingVerify from "@/api/compat/wallet/fund/[id]/verify/route";
import * as walletFundingPrepare from "@/api/compat/wallet/funding/prepare/route";
import * as walletFundingHistory from "@/api/compat/wallet/funding/route";
import * as walletTransactions from "@/api/compat/wallet/transactions/route";
import * as withdrawals from "@/api/compat/withdrawals/route";
import * as withdrawalById from "@/api/compat/withdrawals/[id]/route";
import * as withdrawalPolicy from "@/api/compat/withdrawals/policy/route";
import * as withdrawalMethods from "@/api/compat/withdrawal-methods/route";
import * as withdrawalDestinations from "@/api/compat/withdrawal-destinations/route";
import * as withdrawalDestinationById from "@/api/compat/withdrawal-destinations/[id]/route";

type RouteModule = Record<string, unknown>;
export type LegacyRoute = {
  pattern: string;
  module: RouteModule;
};

export const legacyRoutes: LegacyRoute[] = [
  { pattern: "/api/access/verify", module: accessVerify },
  { pattern: "/api/accounts", module: accounts },
  { pattern: "/api/checkout/:checkoutId/pay", module: checkoutPay },
  { pattern: "/api/checkout/:checkoutId", module: checkoutById },
  { pattern: "/api/checkout", module: checkout },
  { pattern: "/api/earnings/entries", module: earningsEntries },
  { pattern: "/api/earnings", module: earnings },
  { pattern: "/api/funding/development/verify", module: developmentFundingVerify },
  { pattern: "/api/health", module: health },
  {
    pattern: "/api/listings/:listingId/integrations/:integrationId/rotate",
    module: listingIntegrationRotate,
  },
  {
    pattern: "/api/listings/:listingId/integrations/:integrationId",
    module: listingIntegration,
  },
  {
    pattern: "/api/listings/:listingId/integrations",
    module: listingIntegrations,
  },
  { pattern: "/api/listings/:listingId/media/:mediaId", module: listingMediaById },
  { pattern: "/api/listings/:listingId/media", module: listingMedia },
  { pattern: "/api/listings/:listingId/access", module: listingAccess },
  { pattern: "/api/listings/:listingId/referral-url", module: listingReferralUrl },
  { pattern: "/api/listings/export", module: listingExport },
  { pattern: "/api/listings/import", module: listingImport },
  { pattern: "/api/listings/:listingId", module: listingById },
  { pattern: "/api/listings", module: listings },
  { pattern: "/api/me/listings", module: myListings },
  { pattern: "/api/me/onboarding", module: onboarding },
  { pattern: "/api/me/profile", module: profile },
  { pattern: "/api/distribution-policy", module: distributionPolicy },
  { pattern: "/api/purchases/reverse", module: purchaseReverse },
  { pattern: "/api/earnings/settlement", module: earningsSettlement },
  { pattern: "/api/treasury/entries/:entryId", module: treasuryEntry },
  { pattern: "/api/treasury/entries", module: treasuryEntries },
  { pattern: "/api/treasury/expenses", module: treasuryExpenses },
  { pattern: "/api/treasury", module: treasury },
  { pattern: "/api/password-reset/request", module: passwordResetRequest },
  { pattern: "/api/password-reset", module: passwordReset },
  { pattern: "/api/purchases/:purchaseId", module: purchaseById },
  { pattern: "/api/purchases", module: purchases },
  { pattern: "/api/referrals/direct", module: referralDirect },
  { pattern: "/api/referrals/account-url", module: referralAccountUrl },
  { pattern: "/api/referrals/downline", module: referralDownline },
  { pattern: "/api/referrals/parent", module: referralParent },
  { pattern: "/api/referrals/uplines", module: referralUplines },
  { pattern: "/api/wallet/fund", module: walletFunding },
  { pattern: "/api/wallet/fund/:fundingId/cancel", module: walletFundingCancel },
  { pattern: "/api/wallet/fund/:fundingId/evidence", module: walletFundingEvidence },
  { pattern: "/api/wallet/fund/:fundingId/initialize", module: walletFundingInitialize },
  { pattern: "/api/wallet/fund/:fundingId/transaction", module: walletFundingTransaction },
  { pattern: "/api/wallet/fund/:fundingId/verify", module: walletFundingVerify },
  { pattern: "/api/wallet/fund/:fundingId", module: walletFundingById },
  { pattern: "/api/wallet/funding/prepare", module: walletFundingPrepare },
  { pattern: "/api/wallet/funding", module: walletFundingHistory },
  { pattern: "/api/wallet/transactions", module: walletTransactions },
  { pattern: "/api/wallet", module: wallet },
  { pattern: "/api/withdrawals/policy", module: withdrawalPolicy },
  { pattern: "/api/withdrawals/:withdrawalId", module: withdrawalById },
  { pattern: "/api/withdrawals", module: withdrawals },
  { pattern: "/api/withdrawal-methods", module: withdrawalMethods },
  { pattern: "/api/withdrawal-destinations/:destinationId", module: withdrawalDestinationById },
  { pattern: "/api/withdrawal-destinations", module: withdrawalDestinations },
];
