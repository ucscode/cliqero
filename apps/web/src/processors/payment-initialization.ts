import {newId} from "@/kernel/ids";
import {ProviderOperationError} from "@/kernel/provider-error";
import type {PaymentProviderRegistry,PaymentRepository} from "@/modules/payment/payment";
import type {PostgresPaymentOperationsRepository} from "@/providers/paystack/persistence/payment-operations";
import type {UnitOfWork} from "@/kernel/unit-of-work";
import type {AccountReader} from "@/modules/identity/account";

export class PaymentInitializationProcessor {
  constructor(private readonly payments:PaymentRepository,private readonly providers:PaymentProviderRegistry,
    private readonly operations:PostgresPaymentOperationsRepository,private readonly uow:UnitOfWork,private readonly accounts:AccountReader) {}
  async process(paymentId:string):Promise<void> {
    const payment=await this.payments.findById(paymentId,{forUpdate:false}); if(!payment)return;
    if(payment.state==="awaiting_payment"||payment.state==="verified")return;
    await this.uow.transaction(async()=>{const locked=await this.payments.findById(paymentId,{forUpdate:true});if(!locked)return;locked.state="initializing";await this.payments.save(locked);});
    const current=await this.payments.findById(paymentId);if(!current||!this.accounts.findById)return; const buyer=await this.accounts.findById(current.buyerId); if(!buyer)return;
    try {
      const provider=this.providers.get(current.providerName);
      const result=await provider.initiate({paymentId:current.id,amount:current.collectionAmount??current.amount,idempotencyKey:current.idempotencyKey,buyerEmail:buyer.email});
      if(result.reference!==current.providerReference)throw new ProviderOperationError(current.providerName,"transaction.initialize",undefined,undefined,"Unexpected provider reference");
      await this.uow.transaction(async()=>{const locked=await this.payments.findById(paymentId,{forUpdate:true});if(!locked)return;locked.state="awaiting_payment";locked.providerInitialization={authorizationUrl:result.authorizationUrl,accessCode:result.accessCode};await this.payments.save(locked);});
    } catch(error) {
      const diagnostic=error instanceof ProviderOperationError?error:new ProviderOperationError(current.providerName,"transaction.initialize",undefined,undefined,error instanceof Error&&/unavailable|unsupported/i.test(error.message)?error.message:"Provider initialization failed",undefined,error instanceof Error&&/unavailable|unsupported/i.test(error.message)?"rejection":"ambiguous");
      await this.operations.recordProviderFailure({paymentId:current.id,provider:diagnostic.provider,operation:diagnostic.operation,error:diagnostic});
      await this.uow.transaction(async()=>{const locked=await this.payments.findById(paymentId,{forUpdate:true});if(!locked)return;locked.state=diagnostic.kind==="ambiguous"?"reconciliation_pending":"initialization_blocked";await this.payments.save(locked);});
    }
  }
}
