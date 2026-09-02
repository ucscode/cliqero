import { PostgresDatabase } from "./postgres/database";
import { PostgresOutbox } from "./postgres/outbox";
import { PostgresIdempotencyRepository } from "./postgres/idempotency";
import {
  PostgresAccountRepository,
  PostgresAccessGrantRepository,
  PostgresEntitlementRepository,
  PostgresListingRepository,
  PostgresPurchaseRepository,
} from "./postgres/repositories";
import { PostgresPaymentRepository } from "./postgres/payments";
import { PostgresProviderEventRepository } from "./postgres/provider-events";
import {
  PostgresCommissionPolicyRepository,
  PostgresReferralGraphRepository,
} from "./postgres/referrals";
import { PostgresReferralAttributionRepository } from "./postgres/attributions";
import { AuthenticationService } from "@/modules/identity/authentication";
import { AuthorizationPolicy } from "@/modules/identity/authorization";
import { AccessService } from "@/modules/access/access";
import { IntegrationService } from "@/modules/access/integrations";
import { DevelopmentPaymentProvider, PaymentProviderRegistry } from "@/modules/payment/payment";
import { PaystackProvider } from "@/providers/paystack/payment/provider";
import { loadPaystackConfiguration } from "@/providers/paystack/payment/config";
import { PaystackWebhookIngress } from "@/providers/paystack/payment/webhook";
import { ListingService } from "@/application/listings";
import { CheckoutService, PaymentCompletionService } from "@/application/commerce";
import { BuyerAccessService } from "@/application/access";
import { ReferralGraphService } from "@/application/referrals";
import { ReferralAttributionService } from "@/application/attributions";
import { CommissionDistributionService } from "@/modules/referral/commission";
import {
  PostgresFinancialDistributionPolicyRepository,
  PostgresLedgerRepository,
} from "./postgres/ledger";
import { PurchaseDistributionProcessor } from "@/processors/purchase-distribution";
import { OperatorAuthorizationService } from "@/modules/identity/operator";
import { PostgresPaymentOperationsRepository } from "@/providers/paystack/persistence/payment-operations";
import {
  PaymentReconciliationService,
  PaystackOperationsInspectionService,
} from "@/providers/paystack/payment/operations";
import { PostgresReversalRepository } from "./postgres/reversals";
import { PurchaseReversalProcessor } from "@/processors/purchase-reversal";
import {
  PostgresSettlementPolicyRepository,
  SettlementProcessor,
} from "@/modules/ledger/settlement";
import { LedgerFundsReservationService } from "@/modules/ledger/reservations";
import {
  PostgresWithdrawalPolicyRepository,
  PostgresWithdrawalRepository,
} from "@/infrastructure/postgres/withdrawals";
import { WithdrawalService } from "@/application/withdrawals";
import { PayoutProviderRegistry, DevelopmentPayoutProvider } from "@/modules/withdrawal/provider";
import { PostgresPayoutRepository } from "@/infrastructure/postgres/payouts";
import { PayoutExecutionProcessor } from "@/processors/payout-execution";
import { PaystackPayoutProvider } from "@/providers/paystack/payout/provider";
import { loadPaystackPayoutConfiguration } from "@/providers/paystack/payout/config";
import { PostgresPaystackRecipientStore } from "@/providers/paystack/persistence/recipients";
import { PostgresPaystackPayoutEventRepository } from "@/providers/paystack/persistence/payout-events";
import { PaystackPayoutWebhookIngress } from "@/providers/paystack/payout/webhook";
import { ExchangeRateService } from "@/modules/money/exchange-service";
import { FrankfurterProvider } from "@/providers/frankfurter/provider";
import { FawazProvider } from "@/providers/fawaz/provider";
import { PostgresExchangeRateCache } from "./postgres/exchange-rates";
import { PaymentInitializationProcessor } from "@/processors/payment-initialization";
import { PaymentInitializationWorker } from "@/workers/payment-initialization/worker";
import { PaymentVerificationProcessor } from "@/processors/payment-verification";
import {
  PostgresFundingRepository,
  PostgresWalletRepository,
  PostgresCheckoutRepository,
} from "./postgres/wallet-commerce";
import {
  FundingService,
  FundingInitializationProcessor,
  FundingVerificationProcessor,
  WalletService,
  WalletCheckoutService,
} from "@/application/wallet-commerce";
import {
  WalletCreditProcessor,
  WalletAvailabilityProcessor,
  CheckoutPaymentProcessor,
  EntitlementIssuanceProcessor,
} from "@/processors/wallet-commerce";
import { PostgresListingMediaRepository } from "@/infrastructure/postgres/listing-media";
import { loadListingMediaStorage } from "@/providers/listing-media/config";
import { ListingMediaDeletionProcessor, ListingMediaService } from "@/application/listing-media";
import { ListingTransferService } from "@/application/listing-transfer";
import { ProfileService } from "@/application/profile";
import { AccountProjectionService } from "@/application/account-projections";
import { loadYamlCommissionPolicy } from "@/modules/referral/yaml-policy";
import { PostgresTreasuryRepository } from "./postgres/treasury";
import { TreasuryService } from "@/modules/treasury/treasury";
import { TreasuryProcessor } from "@/processors/treasury";
import { PostgresApiKeyRepository, ApiKeyService } from "./postgres/api-keys";
import { ApiPrincipalResolver } from "@/modules/identity/api-principal";
import { HierarchyService } from "@/application/hierarchy";
import { OperatorOverviewService } from "@/application/operator-overview";
import { OperatorAccountService } from "@/application/operator-accounts";

export function createContainer(databaseUrl: string) {
  const database = PostgresDatabase.connect(databaseUrl);
  const accounts = new PostgresAccountRepository(database);
  const listings = new PostgresListingRepository(database);
  const listingMediaRepository = new PostgresListingMediaRepository(database);
  const objectStorage = loadListingMediaStorage();
  const listingMedia = new ListingMediaService(
    listings,
    listingMediaRepository,
    objectStorage,
    database,
  );
  const listingMediaDeletion = new ListingMediaDeletionProcessor(
    listingMediaRepository,
    objectStorage,
  );
  const listingService = new ListingService(
    listings,
    new AuthorizationPolicy(),
    database,
    database,
  );
  const listingTransfer = new ListingTransferService(
    listingService,
    listingMedia,
    listingMediaRepository,
  );
  const exchangeRates = new ExchangeRateService(
    [new FrankfurterProvider(), new FawazProvider()],
    new PostgresExchangeRateCache(database),
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
  // Validate the deployment policy while composing the application; malformed
  // commission YAML must fail startup rather than halfway through distribution.
  const loadedYamlCommissionPolicy = loadYamlCommissionPolicy();
  const yamlCommissionPolicy = { getActive: async () => loadedYamlCommissionPolicy };
  const treasuryRepository = new PostgresTreasuryRepository(database);
  const treasury = new TreasuryService(treasuryRepository);
  const treasuryProcessor = new TreasuryProcessor(database, treasuryRepository);
  const settlementPolicy = new PostgresSettlementPolicyRepository(database);
  const settlement = new SettlementProcessor(database, database, ledger, settlementPolicy);
  const reversals = new PostgresReversalRepository(database);
  const withdrawalRepository = new PostgresWithdrawalRepository(database);
  const withdrawalPolicy = new PostgresWithdrawalPolicyRepository(database);
  const fundsReservation = new LedgerFundsReservationService(database);
  const withdrawals = new WithdrawalService(
    withdrawalRepository,
    withdrawalPolicy,
    fundsReservation,
    outbox,
    database,
    new OperatorAuthorizationService(database),
    database,
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
  const providers = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider());
  const paystackConfiguration = loadPaystackConfiguration();
  const paystack = paystackConfiguration
    ? new PaystackProvider(paystackConfiguration.provider)
    : null;
  if (paystack)
    providers.register(paystack, { enabled: true, filters: paystackConfiguration!.filters });
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
  const fundingService = new FundingService(funding, providers, exchangeRates, accounts, database);
  const fundingInitialization = new FundingInitializationProcessor(
    funding,
    providers,
    accounts,
    database,
    paymentOperations,
  );
  const fundingVerification = new FundingVerificationProcessor(
    funding,
    providers,
    database,
    paymentOperations,
  );
  const wallet = new WalletService(walletRepository);
  const walletCredit = new WalletCreditProcessor(funding, walletRepository, database);
  const walletAvailability = new WalletAvailabilityProcessor(walletRepository, database);
  const checkoutPayment = new CheckoutPaymentProcessor(
    checkoutRepository,
    walletRepository,
    purchases,
    database,
  );
  const entitlementIssuance = new EntitlementIssuanceProcessor(purchases, entitlements, database);
  const operators = new OperatorAuthorizationService(database);
  const authentication = new AuthenticationService(database, databaseUrl);
  const apiKeyRepository = new PostgresApiKeyRepository(database);
  const apiKeys = new ApiKeyService(apiKeyRepository, database);
  const principalResolver = new ApiPrincipalResolver(authentication, apiKeys, database);
  return {
    database,
    accounts,
    listings,
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
    principalResolver,
    authorization: new AuthorizationPolicy(),
    integrations: new IntegrationService(database, database),
    profiles: new ProfileService(database),
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
    wallet,
    walletRepository,
    walletCredit,
    walletAvailability,
    checkoutPayment,
    entitlementIssuance,
    referralGraphService: new ReferralGraphService(accounts, referralGraph, database, database),
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
    paystackInspection: new PaystackOperationsInspectionService(paymentOperations, operators),
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
    hierarchy: new HierarchyService(database),
    operatorOverview: new OperatorOverviewService(database),
    operatorAccounts: new OperatorAccountService(database),
  };
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
