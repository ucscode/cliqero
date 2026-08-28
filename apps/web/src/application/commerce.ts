import type { EventOutbox } from "@/kernel/events";
import { newId,type Id } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { ListingRepository } from "@/modules/listing/listing";
import { Money } from "@/modules/money/money";
import { Purchase,type PurchaseRepository } from "@/modules/purchase/purchase";
import type { PaymentRepository,PaymentProviderRegistry } from "@/modules/payment/payment";
import { Entitlement,type EntitlementRepository } from "@/modules/entitlement/entitlement";
import type { PostgresIdempotencyRepository } from "@/infrastructure/postgres/idempotency";
import type {PurchaseAttributionResolver} from "@/modules/referral/attribution";

export class CheckoutService {
  constructor(private listings:ListingRepository,private payments:PaymentRepository,private purchases:PurchaseRepository,
    private providers:PaymentProviderRegistry,private idempotency:PostgresIdempotencyRepository,
    private attribution:PurchaseAttributionResolver,private uow:UnitOfWork) {}
  async initiate(input:{buyerId:Id;buyerEmail:string;listingId:Id;providerName:string;idempotencyKey:string;attributionSource?:string}) {
    const existing=await this.payments.findByIdempotencyKey(input.idempotencyKey);
    if(existing) return {paymentId:existing.id,purchaseId:(await this.purchases.findByIdempotencyKey(input.idempotencyKey))?.id,
      provider:existing.providerName,providerReference:existing.providerReference,
      authorizationUrl:existing.providerInitialization?.authorizationUrl,accessCode:existing.providerInitialization?.accessCode};
    const listing=await this.listings.findById(input.listingId); if(!listing) throw new Error("Listing not found");
    const snapshot=listing.commercialSnapshot();
    const attribution=await this.attribution.resolve(input.attributionSource,listing.id);
    if(snapshot.price.currency!=="USD") throw new Error("A currency provider is required for non-USD checkout");
    const paymentId=newId(); const purchaseId=newId();
    const provider=this.providers.get(input.providerName);
    const initiated=await provider.initiate({paymentId,amount:listing.price,idempotencyKey:input.idempotencyKey,buyerEmail:input.buyerEmail});
    const payment={id:paymentId,providerName:provider.name,providerReference:initiated.reference,buyerId:input.buyerId,
      listingId:listing.id,amount:listing.price,canonicalAmount:Money.of(listing.price.minorAmount,"USD"),state:"pending" as const,idempotencyKey:input.idempotencyKey,
      providerInitialization:{authorizationUrl:initiated.authorizationUrl,accessCode:initiated.accessCode}};
    const purchase=new Purchase(purchaseId,input.buyerId,paymentId,{...snapshot,
      canonicalPrice:{minorAmount:payment.canonicalAmount.minorAmount.toString(),currency:"USD"},
      referralAttributionId:attribution?.attributionId??null,referralLinkId:attribution?.referralLinkId??null,
      referralReferrerAccountId:attribution?.referrerAccountId??null},input.idempotencyKey);
    return this.uow.transaction(async()=>{
      const claimed=await this.idempotency.begin("checkout",input.idempotencyKey);
      if(!claimed) {
        const prior=await this.payments.findByIdempotencyKey(input.idempotencyKey);
        const priorPurchase=await this.purchases.findByIdempotencyKey(input.idempotencyKey);
        if(prior&&priorPurchase)return {paymentId:prior.id,purchaseId:priorPurchase.id,provider:prior.providerName,providerReference:prior.providerReference,
          authorizationUrl:prior.providerInitialization?.authorizationUrl,accessCode:prior.providerInitialization?.accessCode};
        throw new Error("Checkout idempotency request is already processing");
      }
      await this.payments.save(payment); await this.purchases.save(purchase);
      await this.idempotency.complete("checkout",input.idempotencyKey,purchase.id,{paymentId,purchaseId});
      return {paymentId,purchaseId,provider:provider.name,providerReference:initiated.reference,
        authorizationUrl:initiated.authorizationUrl,accessCode:initiated.accessCode};
    });
  }
}

export class PaymentCompletionService {
  constructor(private payments:PaymentRepository,private purchases:PurchaseRepository,private entitlements:EntitlementRepository,
    private providers:PaymentProviderRegistry,private idempotency:PostgresIdempotencyRepository,
    private outbox:EventOutbox,private uow:UnitOfWork) {}
  async complete(input:{paymentId:Id;correlationId:Id}):Promise<Entitlement> {
    const payment=await this.payments.findById(input.paymentId); if(!payment) throw new Error("Payment not found");
    const verified=await this.providers.get(payment.providerName).verify({reference:payment.providerReference,expectedAmount:payment.amount});
    if(!verified.verified||verified.status!=="success") throw new Error("Payment verification failed");
    if(verified.reference!==payment.providerReference)throw new Error("Payment reference mismatch");
    if(!verified.amount.equals(payment.amount))throw new Error("Payment amount or currency mismatch");
    return this.uow.transaction(async()=>{
      const lockedPayment=await this.payments.findById(payment.id,{forUpdate:true}); if(!lockedPayment) throw new Error("Payment not found");
      const purchase=await this.purchases.findByIdempotencyKey(lockedPayment.idempotencyKey); if(!purchase) throw new Error("Purchase not found");
      const lockedPurchase=await this.purchases.findById(purchase.id,{forUpdate:true}); if(!lockedPurchase) throw new Error("Purchase not found");
      const existing=await this.entitlements.findByPurchaseId(lockedPurchase.id);
      if(existing) return existing;
      const key=`${lockedPayment.providerName}:${lockedPayment.providerReference}`;
      const claimed=await this.idempotency.begin("payment-completion",key);
      if(!claimed) {
        const completed=await this.entitlements.findByPurchaseId(lockedPurchase.id);
        if(completed)return completed;
        throw new Error("Payment completion is already processing");
      }
      lockedPayment.state="verified";lockedPayment.providerTransactionId=verified.providerTransactionId;
      lockedPayment.providerFee=verified.providerFee;
      lockedPayment.providerVerifiedPayload={status:verified.status,reference:verified.reference,
        amountMinor:verified.amount.minorAmount.toString(),currency:verified.amount.currency,
        providerFeeMinor:verified.providerFee?.minorAmount.toString(),providerFeeCurrency:verified.providerFee?.currency};
      await this.payments.save(lockedPayment);
      lockedPurchase.markPaid(); lockedPurchase.complete(); await this.purchases.save(lockedPurchase);
      const entitlement=new Entitlement(newId(),lockedPurchase.buyerId,lockedPurchase.terms.listingId,lockedPurchase.id);
      await this.entitlements.save(entitlement);
      const occurredAt=new Date();
      await this.outbox.append([
        {id:newId(),name:"purchase.completed",aggregateId:lockedPurchase.id,correlationId:input.correlationId,occurredAt,payload:{entitlementId:entitlement.id}},
        {id:newId(),name:"entitlement.created",aggregateId:entitlement.id,correlationId:input.correlationId,occurredAt,payload:{purchaseId:lockedPurchase.id}},
      ]);
      await this.idempotency.complete("payment-completion",key,entitlement.id,{entitlementId:entitlement.id});
      return entitlement;
    });
  }
}
