import { PostgresDatabase } from "./postgres/database";
import { PostgresOutbox } from "./postgres/outbox";
import { PostgresIdempotencyRepository } from "./postgres/idempotency";
import { PostgresAccountRepository,PostgresAccessGrantRepository,PostgresEntitlementRepository,PostgresListingRepository,PostgresPurchaseRepository } from "./postgres/repositories";
import { PostgresPaymentRepository } from "./postgres/payments";
import {PostgresProviderEventRepository} from "./postgres/provider-events";
import {PostgresCommissionPolicyRepository,PostgresReferralGraphRepository} from "./postgres/referrals";
import {PostgresReferralAttributionRepository} from "./postgres/attributions";
import { AuthenticationService } from "@/modules/identity/authentication";
import { AuthorizationPolicy } from "@/modules/identity/authorization";
import { AccessService } from "@/modules/access/access";
import { IntegrationService } from "@/modules/access/integrations";
import { DevelopmentPaymentProvider,PaymentProviderRegistry } from "@/modules/payment/payment";
import {PaystackProvider} from "@/modules/payment/paystack";
import {loadPaystackConfiguration} from "@/config/paystack";
import {PaystackWebhookIngress} from "@/application/paystack-webhooks";
import { ListingService } from "@/application/listings";
import { CheckoutService,PaymentCompletionService } from "@/application/commerce";
import { BuyerAccessService } from "@/application/access";
import {ReferralGraphService} from "@/application/referrals";
import {ReferralAttributionService} from "@/application/attributions";
import {CommissionDistributionService} from "@/modules/referral/commission";
import {PostgresFinancialDistributionPolicyRepository,PostgresLedgerRepository} from "./postgres/ledger";
import {PurchaseDistributionProcessor} from "@/processors/purchase-distribution";
import {OperatorAuthorizationService} from "@/modules/identity/operator";
import {PostgresPaymentOperationsRepository} from "./postgres/payment-operations";
import {PaymentReconciliationService,PaystackOperationsInspectionService} from "@/application/payment-operations";
import {PostgresReversalRepository} from "./postgres/reversals";
import {PurchaseReversalProcessor} from "@/processors/purchase-reversal";
import {PostgresSettlementPolicyRepository,SettlementProcessor} from "@/modules/ledger/settlement";
import {LedgerFundsReservationService} from "@/modules/ledger/reservations";
import {PostgresWithdrawalPolicyRepository,PostgresWithdrawalRepository} from "@/infrastructure/postgres/withdrawals";
import {WithdrawalService} from "@/application/withdrawals";
import {PayoutProviderRegistry,DevelopmentPayoutProvider} from "@/modules/withdrawal/provider";
import {PostgresPayoutRepository} from "@/infrastructure/postgres/payouts";
import {PayoutExecutionProcessor} from "@/processors/payout-execution";
import {PaystackPayoutProvider} from "@/modules/withdrawal/paystack-payout";
import {loadPaystackPayoutConfiguration} from "@/config/paystack-payout";
import {PostgresPaystackRecipientStore} from "./postgres/paystack-payout";
import {PostgresPaystackPayoutEventRepository} from "./postgres/paystack-payout-events";
import {PaystackPayoutWebhookIngress} from "@/application/paystack-payout-webhooks";

export function createContainer(databaseUrl:string) {
  const database=PostgresDatabase.connect(databaseUrl);
  const accounts=new PostgresAccountRepository(database); const listings=new PostgresListingRepository(database);
  const purchases=new PostgresPurchaseRepository(database); const entitlements=new PostgresEntitlementRepository(database);
  const grants=new PostgresAccessGrantRepository(database); const payments=new PostgresPaymentRepository(database);
  const outbox=new PostgresOutbox(database); const idempotency=new PostgresIdempotencyRepository(database);
  const providerEvents=new PostgresProviderEventRepository(database);
  const referralGraph=new PostgresReferralGraphRepository(database);
  const commissionPolicy=new PostgresCommissionPolicyRepository(database);
  const referralAttributionRepository=new PostgresReferralAttributionRepository(database);
  const ledger=new PostgresLedgerRepository(database);const financialDistributionPolicy=new PostgresFinancialDistributionPolicyRepository(database);
  const settlementPolicy=new PostgresSettlementPolicyRepository(database);const settlement=new SettlementProcessor(database,database,ledger,settlementPolicy);
  const reversals=new PostgresReversalRepository(database);
  const withdrawalRepository=new PostgresWithdrawalRepository(database);const withdrawalPolicy=new PostgresWithdrawalPolicyRepository(database);
  const fundsReservation=new LedgerFundsReservationService(database);const withdrawals=new WithdrawalService(withdrawalRepository,withdrawalPolicy,fundsReservation,outbox,database,new OperatorAuthorizationService(database));
  const payoutProviders=new PayoutProviderRegistry().register(new DevelopmentPayoutProvider());const payoutRepository=new PostgresPayoutRepository(database);
  const paystackPayoutConfiguration=loadPaystackPayoutConfiguration();
  const paystackPayout=paystackPayoutConfiguration?new PaystackPayoutProvider(paystackPayoutConfiguration,new PostgresPaystackRecipientStore(database)):null;
  if(paystackPayout)payoutProviders.register(paystackPayout);
  const paystackPayoutEvents=new PostgresPaystackPayoutEventRepository(database);
  const payoutExecution=new PayoutExecutionProcessor(withdrawalRepository,payoutRepository,payoutProviders,fundsReservation,outbox,database,paystackPayout?"paystack":"development");
  const providers=new PaymentProviderRegistry().register(new DevelopmentPaymentProvider());
  const paystackConfiguration=loadPaystackConfiguration();
  const paystack=paystackConfiguration?new PaystackProvider(paystackConfiguration):null;
  if(paystack)providers.register(paystack);
  const access=new AccessService(entitlements,grants);
  const referralAttribution=new ReferralAttributionService(referralAttributionRepository,listings);
  const paymentCompletion=new PaymentCompletionService(payments,purchases,entitlements,providers,idempotency,outbox,database);
  const commissionDistribution=new CommissionDistributionService(referralGraph);
  const purchaseDistribution=new PurchaseDistributionProcessor(purchases,commissionDistribution,commissionPolicy,financialDistributionPolicy,ledger,outbox,database);
  const operators=new OperatorAuthorizationService(database);const paymentOperations=new PostgresPaymentOperationsRepository(database);
  return {database,accounts,listings,purchases,entitlements,grants,payments,providerEvents,outbox,idempotency,providers,paystack,
    referralGraph,commissionPolicy,referralAttributionRepository,referralAttribution,
    authentication:new AuthenticationService(database),authorization:new AuthorizationPolicy(),integrations:new IntegrationService(database),
    listingService:new ListingService(listings,new AuthorizationPolicy()),
    checkout:new CheckoutService(listings,payments,purchases,providers,idempotency,referralAttribution,database),
    referralGraphService:new ReferralGraphService(accounts,referralGraph,database),
    commissionDistribution,ledger,financialDistributionPolicy,purchaseDistribution,
    paymentCompletion,paystackWebhook:paystack?new PaystackWebhookIngress(paystack,providerEvents,outbox,database):null,
    paystackPayoutWebhook:paystackPayout?new PaystackPayoutWebhookIngress(paystackPayout,paystackPayoutEvents,payoutRepository,payoutExecution,database):null,
    operators,paymentOperations,paymentReconciliation:new PaymentReconciliationService(payments,paymentCompletion,paymentOperations,operators),
    paystackInspection:new PaystackOperationsInspectionService(paymentOperations,operators),
    settlementPolicy,settlement,reversals,purchaseReversal:new PurchaseReversalProcessor(purchases,ledger,reversals,outbox,database),
    withdrawalRepository,withdrawalPolicy,fundsReservation,withdrawals,payoutProviders,payoutRepository,payoutExecution,paystackPayout,
    buyerAccess:new BuyerAccessService(access,listings,database),access};
}
export type ApplicationContainer=ReturnType<typeof createContainer>;

const globalContainer=globalThis as typeof globalThis & {__cliqeroContainer?:ApplicationContainer};
export function getContainer():ApplicationContainer {
  if(!globalContainer.__cliqeroContainer){
    const databaseUrl=process.env.DATABASE_URL; if(!databaseUrl)throw new Error("DATABASE_URL is required");
    globalContainer.__cliqeroContainer=createContainer(databaseUrl);
  }
  return globalContainer.__cliqeroContainer;
}
