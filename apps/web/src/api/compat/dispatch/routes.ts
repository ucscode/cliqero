import * as accessVerify from "@/api/compat/access/verify/route";
import * as accounts from "@/api/compat/accounts/route";
import * as checkout from "@/api/compat/checkout/route";
import * as checkoutById from "@/api/compat/checkout/[id]/route";
import * as checkoutPay from "@/api/compat/checkout/[id]/pay/route";
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
import * as listingReferralUrl from "@/api/compat/listings/[id]/referral-url/route";
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
import * as operatorListingIntegrations from "@/api/compat/operator/listings/[id]/integrations/route";
import * as operatorListingIntegration from "@/api/compat/operator/listings/[id]/integrations/[integrationId]/route";
import * as operatorListingIntegrationRotate from "@/api/compat/operator/listings/[id]/integrations/[integrationId]/rotate/route";
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

type RouteModule = Record<string, unknown>;
export type LegacyRoute = {
  pattern: string;
  module: RouteModule;
};

export const legacyRoutes: LegacyRoute[] = [
  { pattern: "/api/access/verify", module: accessVerify },
  { pattern: "/api/accounts", module: accounts },
  { pattern: "/api/checkout/:id/pay", module: checkoutPay },
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
  { pattern: "/api/listings/:id/referral-url", module: listingReferralUrl },
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
  {
    pattern: "/api/operator/listings/:id/integrations/:integrationId/rotate",
    module: operatorListingIntegrationRotate,
  },
  {
    pattern: "/api/operator/listings/:id/integrations/:integrationId",
    module: operatorListingIntegration,
  },
  { pattern: "/api/operator/listings/:id/integrations", module: operatorListingIntegrations },
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
  { pattern: "/api/password-reset/request", module: passwordResetRequest },
  { pattern: "/api/password-reset", module: passwordReset },
  { pattern: "/api/purchases/:id", module: purchaseById },
  { pattern: "/api/purchases", module: purchases },
  { pattern: "/api/referrals/direct", module: referralDirect },
  { pattern: "/api/referrals/account-url", module: referralAccountUrl },
  { pattern: "/api/referrals/downline", module: referralDownline },
  { pattern: "/api/referrals/parent", module: referralParent },
  { pattern: "/api/referrals/uplines", module: referralUplines },
  { pattern: "/api/wallet/fund", module: walletFunding },
  { pattern: "/api/wallet/fund/:id/cancel", module: walletFundingCancel },
  { pattern: "/api/wallet/fund/:id/evidence", module: walletFundingEvidence },
  { pattern: "/api/wallet/fund/:id/initialize", module: walletFundingInitialize },
  { pattern: "/api/wallet/fund/:id/transaction", module: walletFundingTransaction },
  { pattern: "/api/wallet/fund/:id/verify", module: walletFundingVerify },
  { pattern: "/api/wallet/fund/:id", module: walletFundingById },
  { pattern: "/api/wallet/funding/prepare", module: walletFundingPrepare },
  { pattern: "/api/wallet/funding", module: walletFundingHistory },
  { pattern: "/api/wallet/transactions", module: walletTransactions },
  { pattern: "/api/wallet", module: wallet },
  { pattern: "/api/withdrawals/policy", module: withdrawalPolicy },
  { pattern: "/api/withdrawals/:id", module: withdrawalById },
  { pattern: "/api/withdrawals", module: withdrawals },
];
