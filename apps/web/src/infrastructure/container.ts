import { PostgresDatabase } from "./postgres/shared/database";
import { PostgresOutbox } from "./postgres/shared/outbox";
import { PostgresIdempotencyRepository } from "./postgres/shared/idempotency";
import { PostgresAccountRepository } from "./postgres/identity/accounts";
import { PostgresAccessGrantRepository } from "./postgres/access/repository";
import { PostgresEntitlementRepository } from "./postgres/entitlement/repository";
import { PostgresListingRepository } from "./postgres/listing/repository";
import { PostgresPurchaseRepository } from "./postgres/purchase/repository";
import { PostgresPaymentRepository } from "./postgres/payment/payments";
import { PostgresProviderEventRepository } from "./postgres/payment/provider-events";
import {
  PostgresCommissionPolicyRepository,
  PostgresReferralGraphRepository,
} from "./postgres/referral/referrals";
import { PostgresReferralAttributionRepository } from "./postgres/referral/attributions";
import { AuthenticationService } from "@/application/identity/authentication";
import { BetterAuthBoundary } from "@/infrastructure/identity/better-auth";
import { AuthorizationPolicy } from "@/modules/identity/authorization";
import { AccessService } from "@/modules/access/access";
import { PostgresIntegrationService } from "@/infrastructure/postgres/access/integrations";
import { PaymentProviderRegistry } from "@/modules/payment";
import { registerDevelopmentPaymentProvider } from "@/providers/payment/development/registration";
import { PaystackProvider } from "@/providers/payment/paystack/provider";
import { loadPaystackConfiguration } from "@/providers/payment/paystack/config";
import { PaystackWebhookIngress } from "@/application/payment/paystack/webhook";
import { NowPaymentsProvider } from "@/providers/payment/nowpayments/provider";
import { loadNowPaymentsConfiguration } from "@/providers/payment/nowpayments/config";
import { NowPaymentsExpiryProcessor } from "@/application/funding/expiry";
import { NowPaymentsExpiryPolicy } from "@/providers/payment/nowpayments/expiry-policy";
import { NowPaymentsIpnIngress } from "@/application/payment/nowpayments/ipn";
import { DirectTrc20Provider } from "@/providers/payment/direct-trc20/provider";
import { HttpDirectTrc20Verifier } from "@/providers/payment/direct-trc20/verifier";
import { loadDirectTrc20Configuration } from "@/providers/payment/direct-trc20/config";
import { BankTransferProvider } from "@/providers/payment/bank-transfer/provider";
import { loadBankTransferConfiguration } from "@/providers/payment/bank-transfer/config";
import { ListingService } from "@/application/listing/service";
import { CheckoutService } from "@/application/checkout/service";
import { PaymentCompletionService } from "@/application/checkout/completion";
import { BuyerAccessService } from "@/application/access";
import { ReferralGraphService } from "@/application/referrals";
import { ReferralAttributionService } from "@/application/attributions";
import { CommissionDistributionService } from "@/modules/referral/commission";
import {
  PostgresFinancialDistributionPolicyRepository,
  PostgresLedgerRepository,
} from "./postgres/shared/ledger";
import { PurchaseDistributionProcessor } from "@/processors/purchase/distribution";
import { PostgresOperatorAuthorizationService } from "@/infrastructure/postgres/identity/operator";
import { PostgresPaymentOperationsRepository } from "./postgres/payment/operations";
import {
  PaymentReconciliationService,
  PaystackOperationsInspectionService,
} from "@/application/payment/paystack/reconciliation";
import { PostgresReversalRepository } from "./postgres/purchase/reversals";
import { PurchaseReversalProcessor } from "@/processors/purchase/reversal";
import { SettlementProcessor } from "@/processors/ledger/settlement";
import { PostgresSettlementStore } from "@/infrastructure/postgres/ledger/settlement";
import { PostgresSettlementPolicyRepository } from "@/infrastructure/postgres/ledger/settlement-policy";
import { PostgresLedgerFundsReservationService } from "@/infrastructure/postgres/ledger/reservations";
import {
  PostgresWithdrawalPolicyRepository,
  PostgresWithdrawalRepository,
} from "@/infrastructure/postgres/withdrawal/withdrawals";
import { WithdrawalService } from "@/application/withdrawal/service";
import { PayoutProviderRegistry, DevelopmentPayoutProvider } from "@/modules/withdrawal/provider";
import { PostgresPayoutRepository } from "@/infrastructure/postgres/payout/payouts";
import { PayoutExecutionProcessor } from "@/processors/payout/execution";
import { PaystackPayoutProvider } from "@/providers/payout/paystack/provider";
import { loadPaystackPayoutConfiguration } from "@/providers/payout/paystack/config";
import { PostgresPaystackRecipientStore } from "@/infrastructure/postgres/payout/paystack/recipients";
import { PostgresPaystackPayoutEventRepository } from "@/infrastructure/postgres/payout/paystack/payout-events";
import { PaystackPayoutWebhookIngress } from "@/application/payout/paystack/webhook";
import { PostgresPaystackOperationsRepository } from "@/infrastructure/postgres/payment/paystack/operations";
import { ExchangeRateService } from "@/modules/money/exchange-service";
import { FrankfurterProvider } from "@/providers/money/frankfurter/provider";
import { FawazProvider } from "@/providers/money/fawaz/provider";
import { PostgresExchangeRateCache } from "./postgres/exchange-rates";
import { PaymentInitializationProcessor } from "@/processors/payment/initialization";
import { PaymentInitializationWorker } from "@/workers/payment/initialization/worker";
import { PaymentVerificationProcessor } from "@/processors/payment/verification";
import { PostgresFundingRepository } from "./postgres/funding/repository";
import { PostgresWalletRepository } from "./postgres/wallet/repository";
import { PostgresCheckoutRepository } from "./postgres/checkout/repository";
import { FundingService } from "@/application/funding/service";
import { FundingInitializationProcessor } from "@/application/funding/initialization";
import { FundingVerificationProcessor } from "@/application/funding/verification";
import { PaystackVerificationRecoveryPolicy } from "@/application/payment/paystack/recovery";
import { WalletService } from "@/application/wallet/service";
import { WalletCheckoutService } from "@/application/checkout/wallet";
import {
  WalletCreditProcessor,
  WalletAvailabilityProcessor,
  CheckoutPaymentProcessor,
  EntitlementIssuanceProcessor,
} from "@/processors/wallet/commerce";
import { PostgresListingMediaRepository } from "@/infrastructure/postgres/listing/media";
import { PostgresListingReviewRepository } from "@/infrastructure/postgres/listing/reviews";
import { loadMediaStorage, requirePrivateStorage } from "@/providers/storage/media-config";
import { storefrontConfig, resolveStorefrontMediaProvider } from "@/config/storefront";
import { ListingMediaDeletionProcessor, ListingMediaService } from "@/application/listing/media";
import { ListingTransferService } from "@/application/listing/transfer";
import { ListingReviewService } from "@/application/listing/reviews";
import { ProfileService } from "@/application/account/profile";
import { AccountProjectionService } from "@/infrastructure/postgres/account/projections";
import { loadYamlCommissionPolicy } from "@/modules/referral/yaml-policy";
import { PostgresTreasuryRepository } from "./postgres/treasury/treasury";
import { TreasuryService } from "@/modules/treasury/treasury";
import { TreasuryProcessor } from "@/processors/treasury/processor";
import { PostgresTreasuryDistributionStore } from "@/infrastructure/postgres/treasury/distributions";
import { OperatorTreasuryService } from "@/infrastructure/postgres/operator/treasury";
import { PostgresApiKeyRepository, ApiKeyService } from "./postgres/api-keys";
import { ApiPrincipalResolver } from "@/infrastructure/identity/api-principal";
import { HierarchyService } from "@/application/hierarchy";
import { PostgresHierarchyReader } from "@/infrastructure/postgres/hierarchy/service";
import { OperatorOverviewService } from "@/infrastructure/postgres/operator/overview";
import { OperatorAccountService } from "@/infrastructure/postgres/operator/accounts";
import { CapabilityAdministrationService } from "@/application/identity/capability-administration";
import { PostgresCapabilityAssignmentStore } from "@/infrastructure/postgres/identity/capability-administration";
import { OperatorApiKeyService } from "@/application/operator/api-keys";
import { OperatorFundingService } from "@/application/operator/funding";
import { PostgresOperatorFundingReader } from "@/infrastructure/postgres/operator/funding";
import { BankTransferConfirmationService } from "@/application/funding/bank-transfer/confirmation";
import { BankTransferEvidenceService } from "@/application/funding/bank-transfer/evidence";
import { PostgresBankTransferEvidenceRepository } from "@/infrastructure/postgres/funding/bank-transfer/evidence";
import {
  OperatorDistributionService,
  OperatorEarningsService,
} from "@/infrastructure/postgres/operator/distributions";
import { OperatorWithdrawalService } from "@/infrastructure/postgres/operator/withdrawals";
import { getBlogService } from "@/infrastructure/blog/service";
import { PostgresAuditRecorder } from "@/infrastructure/postgres/shared/audit";
import { PostgresWithdrawalPersistence } from "@/infrastructure/postgres/withdrawal/transaction";
import { writeDevelopmentDiagnostic } from "@/infrastructure/development-log";
import type { LifecycleDiagnosticWriter } from "@/kernel/diagnostics";

const lifecycleDiagnostics: LifecycleDiagnosticWriter = {
  write: writeDevelopmentDiagnostic,
};

export function createContainer(databaseUrl: string) {
  const database = PostgresDatabase.connect(databaseUrl);
  const auditRecorder = new PostgresAuditRecorder(database);
  const accounts = new PostgresAccountRepository(database);
  const listings = new PostgresListingRepository(database);
  const reviews = new PostgresListingReviewRepository(database);
  const listingMediaRepository = new PostgresListingMediaRepository(database);
  const objectStorage = loadMediaStorage();
  const storefrontStorage = resolveStorefrontMediaProvider(storefrontConfig, objectStorage);
  const listingMedia = new ListingMediaService(
    listings,
    listingMediaRepository,
    objectStorage,
    database,
    storefrontStorage.name,
  );
  const listingMediaDeletion = new ListingMediaDeletionProcessor(
    listingMediaRepository,
    objectStorage,
  );
  const listingService = new ListingService(
    listings,
    new AuthorizationPolicy(),
    auditRecorder,
    database,
  );
  const operators = new PostgresOperatorAuthorizationService(database);
  const listingReviews = new ListingReviewService(reviews, listings, operators);
  const listingTransfer = new ListingTransferService(
    listingService,
    listingMedia,
    listingMediaRepository,
  );
  const exchangeRates = new ExchangeRateService(
    [new FrankfurterProvider(), new FawazProvider()],
    new PostgresExchangeRateCache(database),
    configuredDurationMs(process.env.EXCHANGE_RATE_CACHE_TTL_MS, 24 * 60 * 60_000),
    configuredDurationMs(process.env.EXCHANGE_RATE_CACHE_STALE_TTL_MS, 48 * 60 * 60_000),
  );
  const purchases = new PostgresPurchaseRepository(database);
  const entitlements = new PostgresEntitlementRepository(database);
  const grants = new PostgresAccessGrantRepository(database);
  const payments = new PostgresPaymentRepository(database);
  const paymentOperations = new PostgresPaymentOperationsRepository(database);
  const outbox = new PostgresOutbox(database);
  const idempotency = new PostgresIdempotencyRepository(database);
  const providerEvents = new PostgresProviderEventRepository(database);
  const funding = new PostgresFundingRepository(database);
  const walletRepository = new PostgresWalletRepository(database);
  const checkoutRepository = new PostgresCheckoutRepository(database);
  const referralGraph = new PostgresReferralGraphRepository(database);
  const commissionPolicy = new PostgresCommissionPolicyRepository(database);
  const referralAttributionRepository = new PostgresReferralAttributionRepository(database);
  const ledger = new PostgresLedgerRepository(database);
  const financialDistributionPolicy = new PostgresFinancialDistributionPolicyRepository(database);
  const loadedYamlCommissionPolicy = loadYamlCommissionPolicy();
  const yamlCommissionPolicy = { getActive: async () => loadedYamlCommissionPolicy };
  const treasuryRepository = new PostgresTreasuryRepository(database);
  const treasury = new TreasuryService(treasuryRepository);
  const treasuryProcessor = new TreasuryProcessor(
    new PostgresTreasuryDistributionStore(database),
    treasuryRepository,
  );
  const settlementPolicy = new PostgresSettlementPolicyRepository(database);
  const settlement = new SettlementProcessor(
    new PostgresSettlementStore(database, database),
    settlementPolicy,
  );
  const reversals = new PostgresReversalRepository(database);
  const withdrawalRepository = new PostgresWithdrawalRepository(database);
  const withdrawalPolicy = new PostgresWithdrawalPolicyRepository(database);
  const fundsReservation = new PostgresLedgerFundsReservationService(database);
  const withdrawalPersistence = new PostgresWithdrawalPersistence(database, database);
  const withdrawals = new WithdrawalService(
    withdrawalRepository,
    withdrawalPolicy,
    fundsReservation,
    outbox,
    database,
    operators,
    withdrawalPersistence,
  );
  const payoutProviders = new PayoutProviderRegistry().register(new DevelopmentPayoutProvider());
  const payoutRepository = new PostgresPayoutRepository(database);
  const paystackPayoutConfiguration = loadPaystackPayoutConfiguration();
  const paystackPayout = paystackPayoutConfiguration
    ? new PaystackPayoutProvider(
        paystackPayoutConfiguration,
        new PostgresPaystackRecipientStore(database),
      )
    : null;
  if (paystackPayout) payoutProviders.register(paystackPayout);
  const paystackPayoutEvents = new PostgresPaystackPayoutEventRepository(database);
  const payoutExecution = new PayoutExecutionProcessor(
    withdrawalRepository,
    payoutRepository,
    payoutProviders,
    fundsReservation,
    outbox,
    database,
    paystackPayout ? "paystack" : "development",
  );
  const providers = registerDevelopmentPaymentProvider(new PaymentProviderRegistry());
  const paystackInspectionOperations = new PostgresPaystackOperationsRepository(database);
  const paystackConfiguration = loadPaystackConfiguration();
  const paystack = paystackConfiguration
    ? new PaystackProvider(paystackConfiguration.provider, fetch, undefined, exchangeRates)
    : null;
  if (paystack)
    providers.register(paystack, { enabled: true, filters: paystackConfiguration!.filters });
  const nowPaymentsConfiguration = loadNowPaymentsConfiguration(
    "config/modules/payment/nowpayments.yaml",
  );
  const nowPayments = nowPaymentsConfiguration
    ? new NowPaymentsProvider(nowPaymentsConfiguration.provider)
    : null;
  if (nowPayments && nowPaymentsConfiguration)
    providers.register(nowPayments, {
      filters: nowPaymentsConfiguration.filters,
    });
  const directTrc20Configuration = loadDirectTrc20Configuration(
    "config/modules/payment/usdt_trc20.yaml",
  );
  if (directTrc20Configuration) {
    const verifier = new HttpDirectTrc20Verifier({
      ...directTrc20Configuration.provider.verification,
      tokenContract: directTrc20Configuration.provider.tokenContract,
    });
    providers.register(new DirectTrc20Provider(directTrc20Configuration.provider, verifier), {
      filters: directTrc20Configuration.filters,
    });
  }
  const bankTransfer = loadBankTransferConfiguration();
  const bankEvidenceStorageName = bankTransfer?.provider.mediaProvider;
  if (bankTransfer) {
    if (!bankEvidenceStorageName)
      throw new Error("Bank-transfer evidence storage instance is required");
    requirePrivateStorage(objectStorage, bankEvidenceStorageName);
    providers.register(new BankTransferProvider(bankTransfer.provider), {
      filters: bankTransfer.filters,
    });
  }
  const paymentInitialization = new PaymentInitializationProcessor(
    payments,
    providers,
    paymentOperations,
    database,
    accounts,
  );
  const paymentInitializationWorker = new PaymentInitializationWorker(
    payments,
    paymentInitialization,
  );
  const paymentVerification = new PaymentVerificationProcessor(payments, providers, database);
  const access = new AccessService(entitlements, grants);
  const referralAttribution = new ReferralAttributionService(
    referralAttributionRepository,
    listings,
    accounts,
  );
  const paymentCompletion = new PaymentCompletionService(
    payments,
    purchases,
    entitlements,
    providers,
    idempotency,
    outbox,
    database,
  );
  const commissionDistribution = new CommissionDistributionService(referralGraph);
  const purchaseDistribution = new PurchaseDistributionProcessor(
    purchases,
    commissionDistribution,
    commissionPolicy,
    financialDistributionPolicy,
    ledger,
    outbox,
    database,
    yamlCommissionPolicy,
  );
  const fundingInitialization = new FundingInitializationProcessor(
    funding,
    providers,
    accounts,
    database,
    paymentOperations,
    5 * 60_000,
    () => new Date(),
    lifecycleDiagnostics,
  );
  const fundingVerification = new FundingVerificationProcessor(
    funding,
    providers,
    database,
    paymentOperations,
    lifecycleDiagnostics,
    new PaystackVerificationRecoveryPolicy(),
  );
  const fundingService = new FundingService(
    funding,
    providers,
    exchangeRates,
    accounts,
    database,
    fundingVerification,
    lifecycleDiagnostics,
  );
  const fundingExpiry = new NowPaymentsExpiryProcessor(
    funding,
    fundingVerification,
    new NowPaymentsExpiryPolicy(),
    () => new Date(),
  );
  const wallet = new WalletService(walletRepository);
  const walletCredit = new WalletCreditProcessor(
    funding,
    walletRepository,
    database,
    lifecycleDiagnostics,
  );
  const walletAvailability = new WalletAvailabilityProcessor(
    walletRepository,
    database,
    lifecycleDiagnostics,
  );
  const checkoutPayment = new CheckoutPaymentProcessor(
    checkoutRepository,
    walletRepository,
    purchases,
    database,
  );
  const entitlementIssuance = new EntitlementIssuanceProcessor(purchases, entitlements, database);
  const betterAuth = new BetterAuthBoundary(database, databaseUrl);
  const authentication = Object.assign(new AuthenticationService(accounts, betterAuth, database), {
    auth: betterAuth.auth,
    betterAuth,
  });
  const apiKeyRepository = new PostgresApiKeyRepository(database);
  const apiKeys = new ApiKeyService(apiKeyRepository, database, database);
  const operatorApiKeys = new OperatorApiKeyService(
    apiKeys,
    accounts,
    operators,
    auditRecorder,
    database,
  );
  const principalResolver = new ApiPrincipalResolver(authentication, apiKeys, database);
  const capabilityAdministration = new CapabilityAdministrationService(
    accounts,
    operators,
    new PostgresCapabilityAssignmentStore(database),
    auditRecorder,
    database,
  );
  const bankTransferConfirmation = new BankTransferConfirmationService(
    funding,
    auditRecorder,
    database,
  );
  const operatorFunding = new OperatorFundingService(
    new PostgresOperatorFundingReader(database),
    bankTransferConfirmation,
  );
  const bankTransferEvidence = new BankTransferEvidenceService(
    funding,
    new PostgresBankTransferEvidenceRepository(database),
    auditRecorder,
    database,
    objectStorage,
    bankEvidenceStorageName,
  );
  return {
    database,
    accounts,
    listings,
    reviews,
    listingReviews,
    listingMediaRepository,
    objectStorage,
    listingMedia,
    listingMediaDeletion,
    purchases,
    entitlements,
    grants,
    payments,
    providerEvents,
    outbox,
    idempotency,
    providers,
    paystack,
    referralGraph,
    commissionPolicy,
    referralAttributionRepository,
    referralAttribution,
    authentication,
    apiKeys,
    operatorApiKeys,
    principalResolver,
    authorization: new AuthorizationPolicy(),
    integrations: new PostgresIntegrationService(database, database),
    profiles: new ProfileService(accounts),
    accountProjections: new AccountProjectionService(database),
    listingService,
    listingTransfer,
    legacyProviderCheckout: new CheckoutService(
      listings,
      payments,
      purchases,
      providers,
      idempotency,
      referralAttribution,
      database,
      accounts,
      exchangeRates,
    ),
    walletCheckout: new WalletCheckoutService(
      listings,
      checkoutRepository,
      purchases,
      referralAttribution,
      database,
    ),
    checkoutRepository,
    funding,
    fundingService,
    fundingInitialization,
    fundingVerification,
    fundingExpiry,
    wallet,
    walletRepository,
    walletCredit,
    walletAvailability,
    checkoutPayment,
    entitlementIssuance,
    referralGraphService: new ReferralGraphService(
      accounts,
      referralGraph,
      database,
      auditRecorder,
    ),
    commissionDistribution,
    ledger,
    financialDistributionPolicy,
    yamlCommissionPolicy,
    purchaseDistribution,
    treasuryRepository,
    treasury,
    treasuryProcessor,
    legacyPaymentCompletion: paymentCompletion,
    paystackWebhook: paystack
      ? new PaystackWebhookIngress(paystack, providerEvents, outbox, database)
      : null,
    nowPaymentsIpn: nowPayments ? new NowPaymentsIpnIngress(nowPayments, funding, database) : null,
    paystackPayoutWebhook: paystackPayout
      ? new PaystackPayoutWebhookIngress(
          paystackPayout,
          paystackPayoutEvents,
          payoutRepository,
          payoutExecution,
          database,
        )
      : null,
    operators,
    paymentOperations,
    paymentInitialization,
    paymentInitializationWorker,
    paymentVerification,
    paymentReconciliation: new PaymentReconciliationService(
      payments,
      paymentVerification,
      paymentOperations,
      operators,
    ),
    paystackInspection: new PaystackOperationsInspectionService(
      paystackInspectionOperations,
      operators,
    ),
    settlementPolicy,
    settlement,
    reversals,
    purchaseReversal: new PurchaseReversalProcessor(purchases, ledger, reversals, outbox, database),
    withdrawalRepository,
    withdrawalPolicy,
    fundsReservation,
    withdrawals,
    payoutProviders,
    payoutRepository,
    payoutExecution,
    paystackPayout,
    exchangeRates,
    buyerAccess: new BuyerAccessService(access, listings, database, purchases, entitlements),
    access,
    hierarchy: new HierarchyService(new PostgresHierarchyReader(database)),
    operatorOverview: new OperatorOverviewService(database),
    operatorAccounts: new OperatorAccountService(database),
    capabilityAdministration,
    operatorFunding,
    bankTransferEvidence,
    operatorDistributions: new OperatorDistributionService(database),
    operatorEarnings: new OperatorEarningsService(database),
    operatorWithdrawals: new OperatorWithdrawalService(database),
    operatorTreasury: new OperatorTreasuryService(database),
    blog: getBlogService(),
  };
}

function configuredDurationMs(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error("Exchange-rate cache TTL must be a positive integer in milliseconds");
  return parsed;
}

export type ApplicationContainer = ReturnType<typeof createContainer>;

const globalContainer = globalThis as typeof globalThis & {
  __cliqeroContainer?: ApplicationContainer;
};

export function getContainer(): ApplicationContainer {
  if (!globalContainer.__cliqeroContainer) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    globalContainer.__cliqeroContainer = createContainer(databaseUrl);
  }
  return globalContainer.__cliqeroContainer;
}
