import type {PaymentProviderRegistry} from "@/modules/payment/payment";
import type {PostgresPaymentRepository} from "@/infrastructure/postgres/payments";
import type {UnitOfWork} from "@/kernel/unit-of-work";
export class PaymentVerificationProcessor {
  constructor(private readonly payments:PostgresPaymentRepository,private readonly providers:PaymentProviderRegistry,private readonly uow:UnitOfWork){}
  async process(paymentId:string){const payment=await this.payments.findById(paymentId);if(!payment||payment.state!=="verification_pending")return;
    await this.uow.transaction(async()=>{const locked=await this.payments.findById(paymentId,{forUpdate:true});if(!locked||locked.state!=="verification_pending")return;locked.state="verifying";await this.payments.save(locked);});
    const current=await this.payments.findById(paymentId);if(!current)return;
    try{const verified=await this.providers.get(current.providerName).verify({reference:current.providerReference,expectedAmount:current.collectionAmount??current.amount});
      await this.uow.transaction(async()=>{const locked=await this.payments.findById(paymentId,{forUpdate:true});if(!locked)return;if(verified.verified&&verified.status==="success"&&verified.reference===locked.providerReference&&verified.amount.equals(locked.collectionAmount??locked.amount)){locked.state="verified";locked.providerTransactionId=verified.providerTransactionId;locked.providerFee=verified.providerFee;await this.payments.save(locked);}else{locked.state="failed";await this.payments.save(locked);}});
    }catch{await this.uow.transaction(async()=>{const locked=await this.payments.findById(paymentId,{forUpdate:true});if(!locked)return;locked.state="verification_pending";await this.payments.save(locked);});}
  }
}
