import { compatibilityContracts as accessVerifyContracts } from "@/api/compat/access/verify/openapi";
import { compatibilityContracts as accountContracts } from "@/api/compat/accounts/openapi";
import {
  compatibilityContracts as checkoutContracts,
  compatibilityExamples as checkoutExamples,
} from "@/api/compat/checkout/openapi";
import { compatibilityContracts as distributionPolicyContracts } from "@/api/compat/distribution-policy/openapi";
import { compatibilityContracts as earningsContracts } from "@/api/compat/earnings/openapi";
import { compatibilityContracts as developmentFundingContracts } from "@/api/compat/funding/development/verify/openapi";
import { compatibilityContracts as healthContracts } from "@/api/compat/health/openapi";
import {
  compatibilityContracts as listingContracts,
  compatibilityExamples as listingExamples,
} from "@/api/compat/listings/openapi";
import {
  compatibilityContracts as listingMediaContracts,
  compatibilityExamples as listingMediaExamples,
} from "@/api/compat/listings/media/openapi";
import { compatibilityContracts as listingIntegrationContracts } from "@/api/compat/listings/integrations/openapi";
import { compatibilityContracts as passwordResetContracts } from "@/api/compat/password-reset/openapi";
import { compatibilityContracts as purchaseContracts } from "@/api/compat/purchases/openapi";
import {
  compatibilityContracts as referralContracts,
  compatibilityExamples as referralExamples,
} from "@/api/compat/referrals/openapi";
import { compatibilityContracts as treasuryContracts } from "@/api/compat/treasury/openapi";
import {
  compatibilityContracts as walletContracts,
  compatibilityExamples as walletExamples,
} from "@/api/compat/wallet/openapi";
import { compatibilityContracts as fundingContracts } from "@/api/compat/wallet/fund/openapi";
import {
  compatibilityContracts as walletTransferContracts,
  compatibilityExamples as walletTransferExamples,
} from "@/api/compat/wallet/transfers/openapi";
import {
  compatibilityContracts as destinationContracts,
  compatibilityExamples as destinationExamples,
} from "@/api/compat/withdrawal-destinations/openapi";
import { compatibilityContracts as withdrawalMethodContracts } from "@/api/compat/withdrawal-methods/openapi";
import {
  compatibilityContracts as withdrawalContracts,
  compatibilityExamples as withdrawalExamples,
} from "@/api/compat/withdrawals/openapi";
import { compatibilityExamples as reviewExamples } from "@/api/routes/reviews/openapi";
import type { CompatibilityOperationContract } from "@/api/openapi/compatibility";

/** Collects route-owned compatibility descriptors; resource schemas stay with their owner. */
export const compatibilityContracts: Record<string, CompatibilityOperationContract> = Object.assign(
  {},
  accessVerifyContracts,
  accountContracts,
  checkoutContracts,
  distributionPolicyContracts,
  earningsContracts,
  developmentFundingContracts,
  healthContracts,
  listingContracts,
  listingMediaContracts,
  listingIntegrationContracts,
  passwordResetContracts,
  purchaseContracts,
  referralContracts,
  treasuryContracts,
  walletContracts,
  fundingContracts,
  walletTransferContracts,
  destinationContracts,
  withdrawalMethodContracts,
  withdrawalContracts,
);

/** Synthetic representative examples are authored beside the operation owners. */
export const compatibilityExamples: Record<string, unknown> = Object.assign(
  {},
  checkoutExamples,
  listingExamples,
  listingMediaExamples,
  referralExamples,
  walletExamples,
  walletTransferExamples,
  destinationExamples,
  withdrawalExamples,
  reviewExamples,
);
