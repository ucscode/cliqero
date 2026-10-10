import { PostgresDatabase } from "./postgres/shared/database";
import { ApplicationEncryption } from "@/kernel/encryption";
import { PostgresOutbox } from "./postgres/shared/outbox";
import { PostgresIdempotencyRepository } from "./postgres/shared/idempotency";
import { PostgresAccountRepository } from "./postgres/identity/accounts";
import { PostgresAccessGrantRepository } from "./postgres/access/repository";
import { PostgresEntitlementRepository } from "./postgres/entitlement/repository";
import { PostgresListingRepository } from "./postgres/listing/repository";
import { PostgresListingCategoryRepository } from "./postgres/listing/categories";
import { PostgresPurchaseRepository } from "./postgres/purchase/repository";
import { PostgresPaymentRepository } from "./postgres/payment/payments";
import { PostgresProviderEventRepository } from "./postgres/payment/provider-events";
import {
  PostgresCommissionPolicyRepository,
  PostgresReferralGraphRepository,
} from "./postgres/referral/referrals";
import { PostgresReferralAttributionRepository } from "./postgres/referral/attributions";
import { AuthenticationService } from "@/application/identity/authentication";
import { TransactionPinService } from "@/application/identity/transaction-pin";
import { BetterAuthBoundary } from "@/infrastructure/identity/better-auth";
import { PostgresTransactionPinRepository } from "@/infrastructure/postgres/identity/transaction-pin";
import { AuthorizationPolicy } from "@/modules/identity/authorization";
import { AccessService } from "@/modules/access/access";
import { PostgresIntegrationService } from "@/infrastructure/postgres/access/integrations";
import { PaymentProviderRegistry, type PaymentProvider } from "@/modules/payment";
import { registerDevelopmentPaymentProvider } from "@/providers/payment/development/registration";
import { PaystackProvider } from "@/providers/payment/paystack/provider";
import { loadPaystackConfiguration } from "@/providers/payment/paystack/config";
import { PaystackWebhookIngress } from "@/application/payment/paystack/webhook";
import { PaystackProviderEventReprocessingService } from "@/application/payment/paystack/reprocess";
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
import { ListingCategoryService } from "@/application/listing/category/service";
import { CheckoutService } from "@/application/checkout/service";
import { PaymentCompletionService } from "@/application/checkout/completion";
import { BuyerAccessService } from "@/application/access";
import { PackageEntitlementService } from "@/application/package/entitlements";
import { ReferralGraphService } from "@/application/referrals";
import { ReferralAttributionService } from "@/application/attributions";
import { AccountReferralAttributionService } from "@/application/account-referral-attribution";
import { CommissionDistributionService } from "@/modules/referral/commission";
import {
  PostgresFinancialDistributionPolicyRepository,
  PostgresLedgerRepository,
} from "./postgres/shared/ledger";
import { PurchaseDistributionProcessor } from "@/processors/purchase/distribution";
import { PostgresOperatorAuthorizationService } from "@/infrastructure/postgres/identity/operator";
import { PostgresPaymentOperationsRepository } from "./postgres/payment/operations";
import { PaymentReconciliationService } from "@/application/payment/reconciliation";
import { OperatorPaymentService } from "@/application/payment/operator";
import { PostgresOperatorPaymentReader } from "@/infrastructure/postgres/operator/payments";
import { OperatorPurchaseService } from "@/application/operator/purchases";
import { PostgresOperatorPurchaseReader } from "@/infrastructure/postgres/operator/purchases";
import { PostgresReversalRepository } from "./postgres/purchase/reversals";
import { PurchaseReversalProcessor } from "@/processors/purchase/reversal";
import { PurchaseEntitlementReconciliationService } from "@/application/purchase/entitlement-reconciliation";
import { SettlementProcessor } from "@/processors/ledger/settlement";
import { PostgresSettlementStore } from "@/infrastructure/postgres/ledger/settlement";
import { PostgresSettlementPolicyRepository } from "@/infrastructure/postgres/ledger/settlement-policy";
import { PostgresLedgerFundsReservationService } from "@/infrastructure/postgres/ledger/reservations";
import { PostgresWithdrawalRepository } from "@/infrastructure/postgres/withdrawal/withdrawals";
import { WithdrawalPolicyLoader } from "@/modules/withdrawal/policy/loader";
import { WithdrawalService } from "@/application/withdrawal/service";
import { ExchangeRateService } from "@/modules/money/exchange-service";
import { FrankfurterProvider } from "@/providers/money/frankfurter/provider";
import { FawazProvider } from "@/providers/money/fawaz/provider";
import { PostgresExchangeRateCache } from "./postgres/exchange-rates";
import { PaymentInitializationProcessor } from "@/processors/payment/initialization";
import { PaymentInitializationWorker } from "@/workers/payment/initialization/worker";
import { PaymentVerificationProcessor } from "@/processors/payment/verification";
import { PostgresFundingRepository } from "./postgres/funding/repository";
import { PostgresAdministrativeFundingRepository } from "./postgres/funding/administrative";
import { PostgresWalletRepository } from "./postgres/wallet/repository";
import { PostgresWalletTransferService } from "@/infrastructure/postgres/wallet/transfers";
import { WalletTransferCompensationService } from "@/application/wallet/transfer-compensations";
import { PostgresWalletTransferCompensationRepository } from "@/infrastructure/postgres/wallet/transfer-compensations";
import { FeePolicyLoader, type FeePolicySource } from "@/modules/fee/policy";
import { PostgresCheckoutRepository } from "./postgres/checkout/repository";
import { FundingService } from "@/application/funding/service";
import { FundingCreditReconciliationService } from "@/application/funding/reconciliation";
import { FundingReversalService } from "@/application/funding/reversals";
import { PostgresFundingReversalRepository } from "@/infrastructure/postgres/funding/reversals";
import { FundingInitializationProcessor } from "@/application/funding/initialization";
import { FundingVerificationProcessor } from "@/application/funding/verification";
import { PaystackVerificationRecoveryPolicy } from "@/application/payment/paystack/recovery";
import { WalletService } from "@/application/wallet/service";
import { WalletCheckoutPaymentService, WalletCheckoutService } from "@/application/checkout/wallet";
import {
  WalletCreditProcessor,
  WalletAvailabilityProcessor,
  EntitlementIssuanceProcessor,
} from "@/processors/wallet/commerce";
import { PostgresListingMediaRepository } from "@/infrastructure/postgres/listing/media";
import { PostgresListingReviewRepository } from "@/infrastructure/postgres/listing/reviews";
import { loadMediaStorage } from "@/providers/storage/media-config";
import {
  loadUploadsConfiguration,
  resolveBlogMediaProvider,
  resolveCatalogueMediaProvider,
} from "@/config/uploads";
import { ListingMediaDeletionProcessor, ListingMediaService } from "@/application/listing/media";
import { BlogMediaService } from "@/application/blog/media";
import { ListingTransferService } from "@/application/listing/transfer";
import { ListingReviewService } from "@/application/listing/reviews";
import { ProfileService } from "@/application/account/profile";
import { AccountProjectionService } from "@/infrastructure/postgres/account/projections";
import { loadYamlCommissionPolicy } from "@/modules/referral/yaml-policy";
import type { CommissionPolicyRepository } from "@/modules/referral/commission";
import { PostgresTreasuryRepository } from "./postgres/treasury/treasury";
import { TreasuryService } from "@/modules/treasury/treasury";
import { TreasuryProcessor } from "@/processors/treasury/processor";
import { PostgresTreasuryDistributionStore } from "@/infrastructure/postgres/treasury/distributions";
import { OperatorTreasuryService } from "@/infrastructure/postgres/operator/treasury";
import { EarningsAdjustmentService } from "@/application/finance/earnings-adjustments";
import { PostgresEarningsAdjustmentRepository } from "@/infrastructure/postgres/ledger/earnings-adjustments";
import { EarningsCorrectionService } from "@/application/finance/earnings-corrections";
import { PostgresEarningsCorrectionRepository } from "@/infrastructure/postgres/ledger/earnings-corrections";
import { PostgresAccountDebtRepository } from "@/infrastructure/postgres/ledger/account-debt";
import { AccountDebtService } from "@/application/finance/account-debt";
import { AccountValueRecoveryService } from "@/application/finance/account-value-recovery";
import { PostgresApiKeyRepository, ApiKeyService } from "./postgres/api-keys";
import { ApiPrincipalResolver } from "@/infrastructure/identity/api-principal";
import { HierarchyService } from "@/application/hierarchy";
import { PostgresHierarchyReader } from "@/infrastructure/postgres/hierarchy/service";
import { OperatorOverviewService } from "@/infrastructure/postgres/operator/overview";
import {
  OperatorAccountService,
  PostgresOperatorAccountDeletionRepository,
} from "@/infrastructure/postgres/operator/accounts";
import { OperatorAccountManagementService } from "@/application/operator/accounts";
import { CapabilityAdministrationService } from "@/application/identity/capability-administration";
import { PostgresCapabilityAssignmentStore } from "@/infrastructure/postgres/identity/capability-administration";
import { OperatorApiKeyService } from "@/application/operator/api-keys";
import { OperatorFundingService } from "@/application/operator/funding";
import { PostgresOperatorFundingReader } from "@/infrastructure/postgres/operator/funding";
import { BankTransferConfirmationService } from "@/application/funding/bank-transfer/confirmation";
import { BankTransferEvidenceService } from "@/application/funding/bank-transfer/evidence";
import { FundingOperationsService } from "@/application/funding/operations";
import { PostgresBankTransferEvidenceRepository } from "@/infrastructure/postgres/funding/bank-transfer/evidence";
import {
  OperatorDistributionService,
  OperatorEarningsService,
} from "@/infrastructure/postgres/operator/distributions";
import { OperatorWithdrawalService } from "@/infrastructure/postgres/operator/withdrawals";
import { getBlogService } from "@/infrastructure/blog/service";
import { getBlogDatabase } from "@/infrastructure/blog/database";
import { SqliteBlogMediaRepository } from "@/infrastructure/blog/media-repository";
import { PostgresAuditRecorder } from "@/infrastructure/postgres/shared/audit";
import { PostgresWithdrawalPersistence } from "@/infrastructure/postgres/withdrawal/transaction";
import { PostgresWithdrawalDestinationRepository } from "@/infrastructure/postgres/withdrawal/destinations";
import { WithdrawalDestinationService } from "@/application/withdrawal/destinations";
import { WithdrawalMethodRegistry } from "@/modules/withdrawal/methods/registry";
import { writeDevelopmentDiagnostic } from "@/infrastructure/development-log";
import type { LifecycleDiagnosticWriter } from "@/kernel/diagnostics";
import { ProviderConfigurationError, ProviderUnavailableError } from "@/kernel/provider-error";
import { assertProductionDatabaseUrl } from "@/infrastructure/postgres/runtime-security";

const defaultLifecycleDiagnostics: LifecycleDiagnosticWriter = {
  write: writeDevelopmentDiagnostic,
};

export type ContainerOptions = {
  lifecycleDiagnostics?: LifecycleDiagnosticWriter;
  verificationPollMilliseconds?: number;
  feePolicySource?: FeePolicySource;
  yamlCommissionPolicySource?: CommissionPolicyRepository;
};

export function createContainer(databaseUrl: string, options: ContainerOptions = {}) {
  assertProductionDatabaseUrl({ ...process.env, DATABASE_URL: databaseUrl });
  const lifecycleDiagnostics = options.lifecycleDiagnostics ?? defaultLifecycleDiagnostics;
  const verificationPollMilliseconds =
    options.verificationPollMilliseconds ??
    positiveInteger(process.env.FUNDING_VERIFICATION_POLL_MS, 10_000);
  const database = PostgresDatabase.connect(databaseUrl);
  const auditRecorder = lazy(() => new PostgresAuditRecorder(database));
  const accounts = lazy(() => new PostgresAccountRepository(database));
  const listings = lazy(() => new PostgresListingRepository(database, database));
  const listingCategories = lazy(() => new PostgresListingCategoryRepository(database));
  const listingCategoryService = lazy(
    () => new ListingCategoryService(listingCategories(), database, auditRecorder()),
  );
  const reviews = lazy(() => new PostgresListingReviewRepository(database));
  const listingMediaRepository = lazy(() => new PostgresListingMediaRepository(database));
  const objectStorage = lazy(() =>
    loadMediaStorage(undefined, undefined, {
      onFailure: (error) => recordConfigurationFailure("storage", error.instanceName, error),
    }),
  );
  const catalogueMediaProviderName = lazy(
    () => resolveCatalogueMediaProvider(loadUploadsConfiguration(), objectStorage()).name,
  );
  const listingMedia = lazy(
    () =>
      new ListingMediaService(
        listings(),
        listingMediaRepository(),
        objectStorage(),
        database,
        catalogueMediaProviderName(),
      ),
  );
  const listingMediaDeletion = lazy(
    () => new ListingMediaDeletionProcessor(listingMediaRepository(), objectStorage()),
  );
  const authorization = lazy(() => new AuthorizationPolicy());
  const listingService = lazy(
    () =>
      new ListingService(
        listings(),
        authorization(),
        auditRecorder(),
        database,
        listingCategoryService(),
        {
          deleteAllForListing: (listingId: string) => integrations().deleteAllForListing(listingId),
        },
        {
          deleteAllForListing: (listingId: string) => listingMedia().deleteAllForListing(listingId),
        },
        operators(),
      ),
  );
  const operators = lazy(() => new PostgresOperatorAuthorizationService(database));
  const listingReviews = lazy(
    () => new ListingReviewService(reviews(), listings(), operators(), auditRecorder(), database),
  );
  const listingTransfer = lazy(
    () => new ListingTransferService(listingService(), listingMedia(), listingMediaRepository()),
  );
  const exchangeRates = lazy(
    () =>
      new ExchangeRateService(
        [new FrankfurterProvider(), new FawazProvider()],
        new PostgresExchangeRateCache(database),
        configuredDurationMs(process.env.EXCHANGE_RATE_CACHE_TTL_MS, 24 * 60 * 60_000),
        configuredDurationMs(process.env.EXCHANGE_RATE_CACHE_STALE_TTL_MS, 48 * 60 * 60_000),
      ),
  );
  const purchases = lazy(() => new PostgresPurchaseRepository(database));
  const entitlements = lazy(() => new PostgresEntitlementRepository(database));
  const grants = lazy(() => new PostgresAccessGrantRepository(database));
  const payments = lazy(() => new PostgresPaymentRepository(database));
  const paymentOperations = lazy(() => new PostgresPaymentOperationsRepository(database));
  const outbox = lazy(() => new PostgresOutbox(database));
  const idempotency = lazy(() => new PostgresIdempotencyRepository(database));
  const providerEvents = lazy(() => new PostgresProviderEventRepository(database));
  const providerEventReprocessing = lazy(
    () =>
      new PaystackProviderEventReprocessingService(
        providerEvents(),
        outbox(),
        operators(),
        idempotency(),
        auditRecorder(),
        database,
      ),
  );
  const funding = lazy(() => new PostgresFundingRepository(database));
  const walletRepository = lazy(() => new PostgresWalletRepository(database));
  const feePolicy = lazy(() => options.feePolicySource ?? new FeePolicyLoader());
  const walletTransfers = lazy(
    () =>
      new PostgresWalletTransferService(
        database,
        database,
        () => feePolicy().getActive(),
        wallet(),
        fundsReservation(),
        accountDebt(),
        auditRecorder(),
      ),
  );
  const walletTransferCompensations = lazy(() => {
    const repository = new PostgresWalletTransferCompensationRepository(database);
    return new WalletTransferCompensationService(
      repository,
      wallet(),
      fundsReservation(),
      accountDebt(),
      operators(),
      auditRecorder(),
      database,
    );
  });
  const checkoutRepository = lazy(() => new PostgresCheckoutRepository(database));
  const referralGraph = lazy(() => new PostgresReferralGraphRepository(database));
  const commissionPolicy = lazy(() => new PostgresCommissionPolicyRepository(database));
  const referralAttributionRepository = lazy(
    () => new PostgresReferralAttributionRepository(database),
  );
  const accountReferralAttribution = lazy(
    () =>
      new AccountReferralAttributionService(referralAttributionRepository(), accounts(), database),
  );
  const ledger = lazy(() => new PostgresLedgerRepository(database));
  const financialDistributionPolicy = lazy(
    () => new PostgresFinancialDistributionPolicyRepository(database),
  );
  const yamlCommissionPolicy = lazy(() => {
    if (options.yamlCommissionPolicySource) return options.yamlCommissionPolicySource;
    const policy = loadYamlCommissionPolicy();
    return { getActive: async () => policy };
  });
  const treasuryRepository = lazy(() => new PostgresTreasuryRepository(database));
  const treasury = lazy(() => new TreasuryService(treasuryRepository(), database, auditRecorder()));
  const treasuryProcessor = lazy(
    () =>
      new TreasuryProcessor(new PostgresTreasuryDistributionStore(database), treasuryRepository()),
  );
  const settlementPolicy = lazy(() => new PostgresSettlementPolicyRepository(database));
  const settlement = lazy(
    () => new SettlementProcessor(new PostgresSettlementStore(database), database, accountDebt()),
  );
  const reversals = lazy(() => new PostgresReversalRepository(database));
  const withdrawalRepository = lazy(() => new PostgresWithdrawalRepository(database));
  const withdrawalDestinationRepository = lazy(
    () => new PostgresWithdrawalDestinationRepository(database),
  );
  const withdrawalMethods = lazy(() => WithdrawalMethodRegistry.load());
  const withdrawalDestinations = lazy(
    () =>
      new WithdrawalDestinationService(
        withdrawalDestinationRepository(),
        accounts(),
        withdrawalMethods(),
        database,
      ),
  );
  const withdrawalPolicy = lazy(() => new WithdrawalPolicyLoader());
  const fundsReservation = lazy(() => new PostgresLedgerFundsReservationService(database));
  const withdrawalPersistence = lazy(() => new PostgresWithdrawalPersistence(database, database));
  const withdrawals = lazy(
    () =>
      new WithdrawalService(
        withdrawalRepository(),
        withdrawalPolicy(),
        fundsReservation(),
        outbox(),
        database,
        operators(),
        withdrawalPersistence(),
        withdrawalDestinations(),
        feePolicy(),
        treasuryRepository(),
        auditRecorder(),
        accountDebt(),
        authentication(),
      ),
  );

  const paystackDefinition = lazy(() => {
    const configuration = loadConfiguredProvider("payment", "paystack", () =>
      loadPaystackConfiguration(),
    );
    return configuration
      ? {
          provider: new PaystackProvider(configuration.provider, fetch, undefined, exchangeRates()),
          filters: configuration.filters,
        }
      : null;
  });
  const nowPaymentsDefinition = lazy(() => {
    const configuration = loadConfiguredProvider("payment", "nowpayments", () =>
      loadNowPaymentsConfiguration("config/modules/payment/nowpayments.yaml"),
    );
    return configuration
      ? {
          provider: new NowPaymentsProvider(configuration.provider),
          filters: configuration.filters,
        }
      : null;
  });
  const directTrc20Definition = lazy(() => {
    const configuration = loadConfiguredProvider("payment", "direct_trc20", () =>
      loadDirectTrc20Configuration("config/modules/payment/usdt_trc20.yaml"),
    );
    if (!configuration) return null;
    const verifier = new HttpDirectTrc20Verifier({
      ...configuration.provider.verification,
      tokenContract: configuration.provider.tokenContract,
    });
    return {
      provider: new DirectTrc20Provider(configuration.provider, verifier),
      filters: configuration.filters,
    };
  });
  const bankTransferDefinition = lazy(() => {
    const configuration = loadConfiguredProvider("payment", "bank_transfer", () =>
      loadBankTransferConfiguration(),
    );
    return configuration
      ? {
          provider: new BankTransferProvider(configuration.provider),
          filters: configuration.filters,
          mediaProvider: configuration.provider.mediaProvider,
        }
      : null;
  });
  const providers = lazy(() => {
    const registry = registerDevelopmentPaymentProvider(new PaymentProviderRegistry());
    registry.registerLazy("paystack", () => paystackDefinition(), {
      onFailure: (error) => recordConfigurationFailure("payment", "paystack", error),
    });
    registry.registerLazy("nowpayments", () => nowPaymentsDefinition(), {
      onFailure: (error) => recordConfigurationFailure("payment", "nowpayments", error),
    });
    registry.registerLazy("usdt_trc20", () => directTrc20Definition(), {
      onFailure: (error) => recordConfigurationFailure("payment", "usdt_trc20", error),
    });
    registry.registerLazy("bank_transfer", () => bankTransferDefinition(), {
      onFailure: (error) => recordConfigurationFailure("payment", "bank_transfer", error),
    });
    return registry;
  });
  const paystack = lazy(() =>
    resolveOptionalPaymentProvider<PaystackProvider>(providers, "paystack"),
  );
  const nowPayments = lazy(() =>
    resolveOptionalPaymentProvider<NowPaymentsProvider>(providers, "nowpayments"),
  );
  const bankEvidenceStorageName = lazy(() => bankTransferDefinition()?.mediaProvider);
  const paystackWebhook = lazy(() => {
    const provider = paystack();
    return provider
      ? new PaystackWebhookIngress(provider, providerEvents(), outbox(), database)
      : null;
  });
  const nowPaymentsIpn = lazy(() => {
    const provider = nowPayments();
    return provider ? new NowPaymentsIpnIngress(provider, funding(), database) : null;
  });
  const operatorPaymentReader = lazy(() => new PostgresOperatorPaymentReader(database));
  const operatorPurchaseReader = lazy(() => new PostgresOperatorPurchaseReader(database));
  const paymentInitialization = lazy(
    () =>
      new PaymentInitializationProcessor(
        payments(),
        providers(),
        paymentOperations(),
        database,
        accounts(),
      ),
  );
  const paymentInitializationWorker = lazy(
    () => new PaymentInitializationWorker(payments(), paymentInitialization()),
  );
  const paymentVerification = lazy(
    () => new PaymentVerificationProcessor(payments(), providers(), database),
  );
  const access = lazy(() => new AccessService(entitlements(), grants()));
  const referralAttribution = lazy(
    () => new ReferralAttributionService(referralAttributionRepository(), listings(), accounts()),
  );
  const paymentCompletion = lazy(
    () =>
      new PaymentCompletionService(
        payments(),
        purchases(),
        entitlements(),
        providers(),
        idempotency(),
        outbox(),
        database,
      ),
  );
  const commissionDistribution = lazy(() => new CommissionDistributionService(referralGraph()));
  const purchaseDistribution = lazy(
    () =>
      new PurchaseDistributionProcessor(
        purchases(),
        commissionDistribution(),
        commissionPolicy(),
        financialDistributionPolicy(),
        ledger(),
        outbox(),
        database,
        yamlCommissionPolicy(),
        accountDebt(),
      ),
  );
  const fundingInitialization = lazy(
    () =>
      new FundingInitializationProcessor(
        funding(),
        providers(),
        accounts(),
        database,
        paymentOperations(),
        5 * 60_000,
        () => new Date(),
        lifecycleDiagnostics,
      ),
  );
  const fundingVerification = lazy(
    () =>
      new FundingVerificationProcessor(
        funding(),
        providers(),
        database,
        paymentOperations(),
        lifecycleDiagnostics,
        new PaystackVerificationRecoveryPolicy(),
        verificationPollMilliseconds,
      ),
  );
  const fundingService = lazy(
    () =>
      new FundingService(
        funding(),
        providers(),
        exchangeRates(),
        accounts(),
        database,
        fundingVerification(),
        lifecycleDiagnostics,
      ),
  );
  const fundingExpiry = lazy(
    () =>
      new NowPaymentsExpiryProcessor(
        funding(),
        fundingVerification(),
        new NowPaymentsExpiryPolicy(),
        () => new Date(),
      ),
  );
  const wallet = lazy(() => new WalletService(walletRepository()));
  const walletCredit = lazy(
    () => new WalletCreditProcessor(funding(), walletRepository(), database, lifecycleDiagnostics),
  );
  const walletAvailability = lazy(
    () =>
      new WalletAvailabilityProcessor(
        walletRepository(),
        database,
        lifecycleDiagnostics,
        accountDebt(),
      ),
  );
  const fundingCreditReconciliation = lazy(
    () =>
      new FundingCreditReconciliationService(
        funding(),
        walletRepository(),
        walletCredit(),
        walletAvailability(),
        operators(),
        idempotency(),
        auditRecorder(),
        database,
      ),
  );
  const entitlementIssuance = lazy(
    () => new EntitlementIssuanceProcessor(purchases(), entitlements(), database),
  );
  const purchaseEntitlementReconciliation = lazy(
    () =>
      new PurchaseEntitlementReconciliationService(
        purchases(),
        entitlements(),
        entitlementIssuance(),
        operators(),
        idempotency(),
        auditRecorder(),
        database,
      ),
  );
  const betterAuth = lazy(() => new BetterAuthBoundary(database, databaseUrl));
  const authentication = lazy(() =>
    Object.assign(
      new AuthenticationService(
        accounts(),
        betterAuth(),
        database,
        accountReferralAttribution(),
        referralGraphService(),
        auditRecorder(),
      ),
      {
        auth: betterAuth().auth,
        betterAuth: betterAuth(),
      },
    ),
  );
  const transactionPinRepository = lazy(
    () => new PostgresTransactionPinRepository(database, database),
  );
  const transactionPin = lazy(
    () =>
      new TransactionPinService(
        transactionPinRepository(),
        betterAuth(),
        accounts(),
        betterAuth(),
        auditRecorder(),
      ),
  );
  const apiKeyRepository = lazy(() => new PostgresApiKeyRepository(database));
  const applicationEncryption = lazy(() => new ApplicationEncryption());
  const apiKeys = lazy(
    () => new ApiKeyService(apiKeyRepository(), database, database, applicationEncryption()),
  );
  const operatorApiKeys = lazy(
    () => new OperatorApiKeyService(apiKeys(), accounts(), operators(), auditRecorder(), database),
  );
  const principalResolver = lazy(
    () => new ApiPrincipalResolver(authentication(), apiKeys(), database),
  );
  const capabilityAdministration = lazy(
    () =>
      new CapabilityAdministrationService(
        accounts(),
        operators(),
        new PostgresCapabilityAssignmentStore(database),
        auditRecorder(),
        database,
      ),
  );
  const bankTransferConfirmation = lazy(
    () => new BankTransferConfirmationService(funding(), auditRecorder(), database),
  );
  const operatorFunding = lazy(
    () =>
      new OperatorFundingService(
        new PostgresOperatorFundingReader(database, outbox()),
        bankTransferConfirmation(),
        {
          repository: new PostgresAdministrativeFundingRepository(database),
          operators: operators(),
          wallet: wallet(),
          uow: database,
          debt: accountDebt(),
        },
      ),
  );
  const bankTransferEvidence = lazy(() => {
    providers().get("bank_transfer");
    return new BankTransferEvidenceService(
      funding(),
      new PostgresBankTransferEvidenceRepository(database),
      auditRecorder(),
      database,
      objectStorage(),
      bankEvidenceStorageName(),
    );
  });
  const fundingOperations = lazy(
    () =>
      new FundingOperationsService(
        funding(),
        providers(),
        bankTransferEvidence(),
        fundingService(),
      ),
  );
  const checkout = lazy(
    () =>
      new CheckoutService(
        listings(),
        payments(),
        purchases(),
        providers(),
        idempotency(),
        referralAttribution(),
        database,
        accounts(),
        exchangeRates(),
        accountDebt(),
      ),
  );
  const walletCheckout = lazy(
    () =>
      new WalletCheckoutService(
        listings(),
        checkoutRepository(),
        purchases(),
        referralAttribution(),
        database,
      ),
  );
  const walletCheckoutPayment = lazy(
    () =>
      new WalletCheckoutPaymentService(
        checkoutRepository(),
        walletRepository(),
        purchases(),
        database,
        outbox(),
        accountDebt(),
      ),
  );
  const referralGraphService = lazy(
    () => new ReferralGraphService(accounts(), referralGraph(), database, auditRecorder()),
  );
  const paymentReconciliation = lazy(
    () =>
      new PaymentReconciliationService(
        payments(),
        paymentVerification(),
        paymentOperations(),
        operators(),
      ),
  );
  const operatorPayments = lazy(
    () => new OperatorPaymentService(operatorPaymentReader(), operators()),
  );
  const operatorPurchases = lazy(
    () => new OperatorPurchaseService(operatorPurchaseReader(), operators(), database),
  );
  const purchaseReversal = lazy(
    () => new PurchaseReversalProcessor(purchases(), ledger(), reversals(), outbox(), database),
  );
  const buyerAccess = lazy(
    () => new BuyerAccessService(access(), listings(), database, purchases(), entitlements()),
  );
  const packageEntitlements = lazy(
    () => new PackageEntitlementService(entitlements(), database, auditRecorder()),
  );
  const hierarchy = lazy(() => new HierarchyService(new PostgresHierarchyReader(database)));
  const integrations = lazy(() => new PostgresIntegrationService(database, database));
  const profiles = lazy(() => new ProfileService(accounts()));
  const accountProjections = lazy(() => new AccountProjectionService(database));
  const operatorOverview = lazy(() => new OperatorOverviewService(database));
  const operatorAccounts = lazy(() => new OperatorAccountService(database));
  const operatorAccountDeletion = lazy(
    () => new PostgresOperatorAccountDeletionRepository(database),
  );
  const operatorAccountManagement = lazy(
    () =>
      new OperatorAccountManagementService(
        authentication(),
        profiles(),
        operatorAccounts(),
        auditRecorder(),
        database,
        operatorAccountDeletion(),
        operators(),
      ),
  );
  const operatorDistributions = lazy(() => new OperatorDistributionService(database, database));
  const operatorEarnings = lazy(() => new OperatorEarningsService(database, database));
  const operatorWithdrawals = lazy(() => new OperatorWithdrawalService(database));
  const operatorTreasury = lazy(() => new OperatorTreasuryService(database, database));
  const earningsAdjustments = lazy(
    () =>
      new EarningsAdjustmentService(
        new PostgresEarningsAdjustmentRepository(database),
        operators(),
        database,
        accountDebt(),
      ),
  );
  const earningsCorrections = lazy(
    () =>
      new EarningsCorrectionService(
        new PostgresEarningsCorrectionRepository(database),
        operators(),
        accountDebt(),
        auditRecorder(),
        database,
      ),
  );
  const accountDebt = lazy(
    () =>
      new AccountDebtService(new PostgresAccountDebtRepository(database), operators(), database),
  );
  const accountValueRecovery = lazy(
    () =>
      new AccountValueRecoveryService(
        new PostgresFundingReversalRepository(database),
        accountDebt(),
      ),
  );
  const fundingReversals = lazy(
    () =>
      new FundingReversalService(
        new PostgresFundingReversalRepository(database),
        funding(),
        accountValueRecovery(),
        operators(),
        auditRecorder(),
        database,
      ),
  );
  const blog = lazy(() => getBlogService());
  const blogMedia = lazy(() => {
    const storage = objectStorage();
    return new BlogMediaService(
      new SqliteBlogMediaRepository(getBlogDatabase().sqlite),
      storage,
      resolveBlogMediaProvider(loadUploadsConfiguration(), storage).name,
    );
  });

  return {
    database,
    get accounts() {
      return accounts();
    },
    get listings() {
      return listings();
    },
    get reviews() {
      return reviews();
    },
    get listingReviews() {
      return listingReviews();
    },
    get listingMediaRepository() {
      return listingMediaRepository();
    },
    get objectStorage() {
      return objectStorage();
    },
    get listingMedia() {
      return listingMedia();
    },
    get listingMediaDeletion() {
      return listingMediaDeletion();
    },
    get purchases() {
      return purchases();
    },
    get entitlements() {
      return entitlements();
    },
    get grants() {
      return grants();
    },
    get payments() {
      return payments();
    },
    get providerEvents() {
      return providerEvents();
    },
    get providerEventReprocessing() {
      return providerEventReprocessing();
    },
    get outbox() {
      return outbox();
    },
    get idempotency() {
      return idempotency();
    },
    get providers() {
      return providers();
    },
    get paystack() {
      return paystack();
    },
    get referralGraph() {
      return referralGraph();
    },
    get commissionPolicy() {
      return commissionPolicy();
    },
    get referralAttributionRepository() {
      return referralAttributionRepository();
    },
    get referralAttribution() {
      return referralAttribution();
    },
    get accountReferralAttribution() {
      return accountReferralAttribution();
    },
    get authentication() {
      return authentication();
    },
    get transactionPin() {
      return transactionPin();
    },
    get apiKeys() {
      return apiKeys();
    },
    get operatorApiKeys() {
      return operatorApiKeys();
    },
    get principalResolver() {
      return principalResolver();
    },
    get authorization() {
      return authorization();
    },
    get integrations() {
      return integrations();
    },
    get profiles() {
      return profiles();
    },
    get accountProjections() {
      return accountProjections();
    },
    get listingService() {
      return listingService();
    },
    get listingCategories() {
      return listingCategoryService();
    },
    get listingTransfer() {
      return listingTransfer();
    },
    get legacyProviderCheckout() {
      return checkout();
    },
    get walletCheckout() {
      return walletCheckout();
    },
    get checkoutRepository() {
      return checkoutRepository();
    },
    get funding() {
      return funding();
    },
    get fundingService() {
      return fundingService();
    },
    get fundingInitialization() {
      return fundingInitialization();
    },
    get fundingVerification() {
      return fundingVerification();
    },
    get fundingExpiry() {
      return fundingExpiry();
    },
    get wallet() {
      return wallet();
    },
    get walletRepository() {
      return walletRepository();
    },
    get walletTransfers() {
      return walletTransfers();
    },
    get walletTransferCompensations() {
      return walletTransferCompensations();
    },
    get feePolicy() {
      return feePolicy();
    },
    get walletCredit() {
      return walletCredit();
    },
    get walletAvailability() {
      return walletAvailability();
    },
    get fundingCreditReconciliation() {
      return fundingCreditReconciliation();
    },
    get fundingReversals() {
      return fundingReversals();
    },
    get walletCheckoutPayment() {
      return walletCheckoutPayment();
    },
    get entitlementIssuance() {
      return entitlementIssuance();
    },
    get purchaseEntitlementReconciliation() {
      return purchaseEntitlementReconciliation();
    },
    get referralGraphService() {
      return referralGraphService();
    },
    get commissionDistribution() {
      return commissionDistribution();
    },
    get ledger() {
      return ledger();
    },
    get financialDistributionPolicy() {
      return financialDistributionPolicy();
    },
    get yamlCommissionPolicy() {
      return yamlCommissionPolicy();
    },
    get purchaseDistribution() {
      return purchaseDistribution();
    },
    get treasuryRepository() {
      return treasuryRepository();
    },
    get treasury() {
      return treasury();
    },
    get treasuryProcessor() {
      return treasuryProcessor();
    },
    get legacyPaymentCompletion() {
      return paymentCompletion();
    },
    get paystackWebhook() {
      return paystackWebhook();
    },
    get nowPaymentsIpn() {
      return nowPaymentsIpn();
    },
    get operators() {
      return operators();
    },
    get paymentOperations() {
      return paymentOperations();
    },
    get paymentInitialization() {
      return paymentInitialization();
    },
    get paymentInitializationWorker() {
      return paymentInitializationWorker();
    },
    get paymentVerification() {
      return paymentVerification();
    },
    get paymentReconciliation() {
      return paymentReconciliation();
    },
    get operatorPayments() {
      return operatorPayments();
    },
    get operatorPurchases() {
      return operatorPurchases();
    },
    get settlementPolicy() {
      return settlementPolicy();
    },
    get settlement() {
      return settlement();
    },
    get reversals() {
      return reversals();
    },
    get purchaseReversal() {
      return purchaseReversal();
    },
    get withdrawalRepository() {
      return withdrawalRepository();
    },
    get withdrawalPolicy() {
      return withdrawalPolicy();
    },
    get fundsReservation() {
      return fundsReservation();
    },
    get withdrawals() {
      return withdrawals();
    },
    get withdrawalDestinations() {
      return withdrawalDestinations();
    },
    get exchangeRates() {
      return exchangeRates();
    },
    get buyerAccess() {
      return buyerAccess();
    },
    get packageEntitlements() {
      return packageEntitlements();
    },
    get access() {
      return access();
    },
    get hierarchy() {
      return hierarchy();
    },
    get operatorOverview() {
      return operatorOverview();
    },
    get operatorAccounts() {
      return operatorAccounts();
    },
    get operatorAccountManagement() {
      return operatorAccountManagement();
    },
    get capabilityAdministration() {
      return capabilityAdministration();
    },
    get operatorFunding() {
      return operatorFunding();
    },
    get bankTransferEvidence() {
      return bankTransferEvidence();
    },
    get fundingOperations() {
      return fundingOperations();
    },
    get operatorDistributions() {
      return operatorDistributions();
    },
    get operatorEarnings() {
      return operatorEarnings();
    },
    get operatorWithdrawals() {
      return operatorWithdrawals();
    },
    get operatorTreasury() {
      return operatorTreasury();
    },
    get earningsAdjustments() {
      return earningsAdjustments();
    },
    get earningsCorrections() {
      return earningsCorrections();
    },
    get accountDebt() {
      return accountDebt();
    },
    get blog() {
      return blog();
    },
    get blogMedia() {
      return blogMedia();
    },
  };
}

function lazy<T>(factory: () => T): () => T {
  let initialized = false;
  let value!: T;
  return () => {
    if (!initialized) {
      value = factory();
      initialized = true;
    }
    return value;
  };
}

function recordConfigurationFailure(feature: string, provider: string, error: unknown) {
  writeDevelopmentDiagnostic({
    level: "error",
    event: "configuration.feature_failed",
    metadata: {
      feature,
      provider,
      error: error instanceof Error ? error.message : "Unknown configuration error",
    },
  });
}

function loadConfiguredProvider<T>(feature: string, provider: string, load: () => T): T {
  try {
    return load();
  } catch (error) {
    if (error instanceof ProviderConfigurationError) throw error;
    throw new ProviderConfigurationError(
      provider,
      `${feature[0].toUpperCase()}${feature.slice(1)} provider configuration is invalid: ${provider}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

function resolveOptionalPaymentProvider<T extends PaymentProvider>(
  registryFactory: () => PaymentProviderRegistry,
  name: string,
): T | null;
function resolveOptionalPaymentProvider<T extends PaymentProvider>(
  registryFactory: () => PaymentProviderRegistry,
  name: string,
): T | null {
  try {
    return registryFactory().get(name) as T;
  } catch (error) {
    if (error instanceof ProviderConfigurationError || error instanceof ProviderUnavailableError)
      return null;
    throw error;
  }
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

export function getContainer(options: ContainerOptions = {}): ApplicationContainer {
  if (!globalContainer.__cliqeroContainer) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    globalContainer.__cliqeroContainer = createContainer(databaseUrl, options);
  }
  return globalContainer.__cliqeroContainer;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
