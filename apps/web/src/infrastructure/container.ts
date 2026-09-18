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
import { PaymentProviderRegistry, type PaymentProvider } from "@/modules/payment";
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
import { loadMediaStorage } from "@/providers/storage/media-config";
import { loadStorefrontConfiguration, resolveStorefrontMediaProvider } from "@/config/storefront";
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
import { ProviderConfigurationError, ProviderUnavailableError } from "@/kernel/provider-error";

const lifecycleDiagnostics: LifecycleDiagnosticWriter = {
  write: writeDevelopmentDiagnostic,
};

export function createContainer(databaseUrl: string) {
  const database = PostgresDatabase.connect(databaseUrl);
  const auditRecorder = lazy(() => new PostgresAuditRecorder(database));
  const accounts = lazy(() => new PostgresAccountRepository(database));
  const listings = lazy(() => new PostgresListingRepository(database));
  const reviews = lazy(() => new PostgresListingReviewRepository(database));
  const listingMediaRepository = lazy(() => new PostgresListingMediaRepository(database));
  const objectStorage = lazy(() =>
    loadMediaStorage(undefined, undefined, {
      onFailure: (error) => recordConfigurationFailure("storage", error.instanceName, error),
    }),
  );
  const storefrontProviderName = lazy(
    () => resolveStorefrontMediaProvider(loadStorefrontConfiguration(), objectStorage()).name,
  );
  const listingMedia = lazy(
    () =>
      new ListingMediaService(
        listings(),
        listingMediaRepository(),
        objectStorage(),
        database,
        storefrontProviderName(),
      ),
  );
  const listingMediaDeletion = lazy(
    () => new ListingMediaDeletionProcessor(listingMediaRepository(), objectStorage()),
  );
  const authorization = lazy(() => new AuthorizationPolicy());
  const listingService = lazy(
    () => new ListingService(listings(), authorization(), auditRecorder(), database),
  );
  const operators = lazy(() => new PostgresOperatorAuthorizationService(database));
  const listingReviews = lazy(() => new ListingReviewService(reviews(), listings(), operators()));
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
  const funding = lazy(() => new PostgresFundingRepository(database));
  const walletRepository = lazy(() => new PostgresWalletRepository(database));
  const checkoutRepository = lazy(() => new PostgresCheckoutRepository(database));
  const referralGraph = lazy(() => new PostgresReferralGraphRepository(database));
  const commissionPolicy = lazy(() => new PostgresCommissionPolicyRepository(database));
  const referralAttributionRepository = lazy(
    () => new PostgresReferralAttributionRepository(database),
  );
  const ledger = lazy(() => new PostgresLedgerRepository(database));
  const financialDistributionPolicy = lazy(
    () => new PostgresFinancialDistributionPolicyRepository(database),
  );
  const yamlCommissionPolicy = lazy(() => {
    const policy = loadYamlCommissionPolicy();
    return { getActive: async () => policy };
  });
  const treasuryRepository = lazy(() => new PostgresTreasuryRepository(database));
  const treasury = lazy(() => new TreasuryService(treasuryRepository()));
  const treasuryProcessor = lazy(
    () =>
      new TreasuryProcessor(new PostgresTreasuryDistributionStore(database), treasuryRepository()),
  );
  const settlementPolicy = lazy(() => new PostgresSettlementPolicyRepository(database));
  const settlement = lazy(
    () =>
      new SettlementProcessor(new PostgresSettlementStore(database, database), settlementPolicy()),
  );
  const reversals = lazy(() => new PostgresReversalRepository(database));
  const withdrawalRepository = lazy(() => new PostgresWithdrawalRepository(database));
  const withdrawalPolicy = lazy(() => new PostgresWithdrawalPolicyRepository(database));
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
      ),
  );

  const paystackPayoutDefinition = lazy(() => {
    const configuration = loadConfiguredProvider("payout", "paystack", () =>
      loadPaystackPayoutConfiguration(),
    );
    return configuration
      ? new PaystackPayoutProvider(configuration, new PostgresPaystackRecipientStore(database))
      : null;
  });
  const payoutProviders = lazy(() => {
    const registry = new PayoutProviderRegistry().register(new DevelopmentPayoutProvider());
    registry.registerLazy("paystack", () => paystackPayoutDefinition(), {
      onFailure: (error) => recordConfigurationFailure("payout", "paystack", error),
    });
    return registry;
  });
  const payoutRepository = lazy(() => new PostgresPayoutRepository(database));
  const payoutDefaultProvider = lazy(() => {
    try {
      payoutProviders().get("paystack");
      return "paystack";
    } catch (error) {
      if (error instanceof ProviderUnavailableError) return "development";
      if (error instanceof ProviderConfigurationError) return "paystack";
      throw error;
    }
  });
  const paystackPayout = lazy(() => {
    try {
      return payoutProviders().get("paystack") as PaystackPayoutProvider;
    } catch (error) {
      if (error instanceof ProviderConfigurationError || error instanceof ProviderUnavailableError)
        return null;
      throw error;
    }
  });
  const paystackPayoutEvents = lazy(() => new PostgresPaystackPayoutEventRepository(database));
  const payoutExecution = lazy(
    () =>
      new PayoutExecutionProcessor(
        withdrawalRepository(),
        payoutRepository(),
        payoutProviders(),
        fundsReservation(),
        outbox(),
        database,
        payoutDefaultProvider(),
      ),
  );
  const paystackPayoutWebhook = lazy(() => {
    const provider = paystackPayout();
    return provider
      ? new PaystackPayoutWebhookIngress(
          provider,
          paystackPayoutEvents(),
          payoutRepository(),
          payoutExecution(),
          database,
        )
      : null;
  });

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
  const paystackInspectionOperations = lazy(
    () => new PostgresPaystackOperationsRepository(database),
  );
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
    () => new WalletAvailabilityProcessor(walletRepository(), database, lifecycleDiagnostics),
  );
  const checkoutPayment = lazy(
    () =>
      new CheckoutPaymentProcessor(checkoutRepository(), walletRepository(), purchases(), database),
  );
  const entitlementIssuance = lazy(
    () => new EntitlementIssuanceProcessor(purchases(), entitlements(), database),
  );
  const betterAuth = lazy(() => new BetterAuthBoundary(database, databaseUrl));
  const authentication = lazy(() =>
    Object.assign(new AuthenticationService(accounts(), betterAuth(), database), {
      auth: betterAuth().auth,
      betterAuth: betterAuth(),
    }),
  );
  const apiKeyRepository = lazy(() => new PostgresApiKeyRepository(database));
  const apiKeys = lazy(() => new ApiKeyService(apiKeyRepository(), database, database));
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
        new PostgresOperatorFundingReader(database),
        bankTransferConfirmation(),
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
  const paystackInspection = lazy(
    () => new PaystackOperationsInspectionService(paystackInspectionOperations(), operators()),
  );
  const purchaseReversal = lazy(
    () => new PurchaseReversalProcessor(purchases(), ledger(), reversals(), outbox(), database),
  );
  const buyerAccess = lazy(
    () => new BuyerAccessService(access(), listings(), database, purchases(), entitlements()),
  );
  const hierarchy = lazy(() => new HierarchyService(new PostgresHierarchyReader(database)));
  const integrations = lazy(() => new PostgresIntegrationService(database, database));
  const profiles = lazy(() => new ProfileService(accounts()));
  const accountProjections = lazy(() => new AccountProjectionService(database));
  const operatorOverview = lazy(() => new OperatorOverviewService(database));
  const operatorAccounts = lazy(() => new OperatorAccountService(database));
  const operatorDistributions = lazy(() => new OperatorDistributionService(database));
  const operatorEarnings = lazy(() => new OperatorEarningsService(database));
  const operatorWithdrawals = lazy(() => new OperatorWithdrawalService(database));
  const operatorTreasury = lazy(() => new OperatorTreasuryService(database));
  const blog = lazy(() => getBlogService());

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
    get authentication() {
      return authentication();
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
    get walletCredit() {
      return walletCredit();
    },
    get walletAvailability() {
      return walletAvailability();
    },
    get checkoutPayment() {
      return checkoutPayment();
    },
    get entitlementIssuance() {
      return entitlementIssuance();
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
    get paystackPayoutWebhook() {
      return paystackPayoutWebhook();
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
    get paystackInspection() {
      return paystackInspection();
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
    get payoutProviders() {
      return payoutProviders();
    },
    get payoutRepository() {
      return payoutRepository();
    },
    get payoutExecution() {
      return payoutExecution();
    },
    get paystackPayout() {
      return paystackPayout();
    },
    get exchangeRates() {
      return exchangeRates();
    },
    get buyerAccess() {
      return buyerAccess();
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
    get capabilityAdministration() {
      return capabilityAdministration();
    },
    get operatorFunding() {
      return operatorFunding();
    },
    get bankTransferEvidence() {
      return bankTransferEvidence();
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
    get blog() {
      return blog();
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

export function getContainer(): ApplicationContainer {
  if (!globalContainer.__cliqeroContainer) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    globalContainer.__cliqeroContainer = createContainer(databaseUrl);
  }
  return globalContainer.__cliqeroContainer;
}
