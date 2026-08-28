import { createHash } from "node:crypto";
import type { Id } from "@/kernel/ids";
import type { Money } from "@/modules/money/money";

export type PaymentState="pending"|"verified"|"failed";
export interface PaymentRecord {
  id:Id; providerName:string; providerReference:string; buyerId:Id; listingId:Id;
  amount:Money; canonicalAmount:Money; state:PaymentState; idempotencyKey:string;
  providerTransactionId?:string;providerVerifiedPayload?:unknown;
  providerFee?:Money;
  providerInitialization?:{authorizationUrl?:string;accessCode?:string};
}
export interface PaymentRepository {
  findById(id:Id,options?:{forUpdate?:boolean}):Promise<PaymentRecord|null>;
  findByProviderReference(providerName:string,reference:string):Promise<PaymentRecord|null>;
  findByIdempotencyKey(key:string):Promise<PaymentRecord|null>;
  save(payment:PaymentRecord):Promise<void>;
}
export interface PaymentInitialization {reference:string;authorizationUrl?:string;accessCode?:string;}
export interface PaymentVerification {verified:boolean;reference:string;amount:Money;providerTransactionId?:string;providerFee?:Money;status:string;}
export interface PaymentProvider {
  readonly name:string;
  initiate(input:{paymentId:Id;amount:Money;idempotencyKey:string;buyerEmail:string}):Promise<PaymentInitialization>;
  verify(input:{reference:string;expectedAmount:Money}):Promise<PaymentVerification>;
}
export class PaymentProviderRegistry {
  private readonly providers=new Map<string,PaymentProvider>();
  register(provider:PaymentProvider):this { this.providers.set(provider.name,provider); return this; }
  get(name:string):PaymentProvider {
    const provider=this.providers.get(name); if(!provider) throw new Error(`Payment provider is unavailable: ${name}`); return provider;
  }
}
export class DevelopmentPaymentProvider implements PaymentProvider {
  readonly name="development";
  async initiate(input:{paymentId:Id;amount:Money;idempotencyKey:string;buyerEmail:string}) {
    const digest=createHash("sha256").update(`${input.paymentId}:${input.idempotencyKey}`).digest("hex").slice(0,24);
    return {reference:`dev_${digest}`};
  }
  async verify(input:{reference:string;expectedAmount:Money}) {
    return {verified:input.reference.startsWith("dev_") && input.expectedAmount.minorAmount>=0n,
      reference:input.reference,amount:input.expectedAmount,status:"success"};
  }
}
