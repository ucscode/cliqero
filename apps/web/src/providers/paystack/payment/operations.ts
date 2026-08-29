import type {PaymentCompletionService} from "@/application/commerce";
import type {PostgresPaymentRepository} from "@/infrastructure/postgres/payments";
import type {PostgresPaymentOperationsRepository,ReconciliationAttempt} from "../persistence/payment-operations";
import type {OperatorAuthorizationService} from "@/modules/identity/operator";

export class PaymentReconciliationService {
  constructor(private readonly payments:PostgresPaymentRepository,private readonly completion:PaymentCompletionService,
    private readonly operations:PostgresPaymentOperationsRepository,private readonly operators:OperatorAuthorizationService){}
  async reconcile(input:{actorId:string;paymentId:string;idempotencyKey:string;correlationId:string}):Promise<ReconciliationAttempt>{
    await this.operators.requireOperator(input.actorId);const payment=await this.payments.findById(input.paymentId);if(!payment)throw new Error("Payment not found");
    if(payment.providerName!=="paystack")throw new Error("Only Paystack payments can be reconciled by this operation");
    const begun=await this.operations.begin(input);if(!begun.created)return begun.attempt;
    if(payment.state==="verified"){await this.operations.finish(begun.attempt.id,"skipped",{reason:"already-completed"});return {...begun.attempt,state:"skipped",result:{reason:"already-completed"}};}
    try{const entitlement=await this.completion.complete({paymentId:payment.id,correlationId:input.correlationId});
      await this.operations.finish(begun.attempt.id,"completed",{entitlementId:entitlement.id});return {...begun.attempt,state:"completed",result:{entitlementId:entitlement.id}};
    }catch(error){const message=error instanceof Error?error.message:"Reconciliation failed";const mismatch=/mismatch/i.test(message);
      await this.operations.finish(begun.attempt.id,mismatch?"mismatch":"failed",{completed:false},message);throw error;}
  }
  async eligible(input:{actorId:string;olderThanMinutes:number;limit:number}){await this.operators.requireOperator(input.actorId);
    return this.payments.findPendingByProviderOlderThan("paystack",new Date(Date.now()-input.olderThanMinutes*60_000),input.limit);}
}

export class PaystackOperationsInspectionService {
  constructor(private readonly operations:PostgresPaymentOperationsRepository,private readonly operators:OperatorAuthorizationService){}
  async listEvents(actorId:string,limit:number){await this.operators.requireOperator(actorId);return this.operations.listProviderEvents(limit);}
}
