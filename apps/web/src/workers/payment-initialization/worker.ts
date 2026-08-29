import type {PostgresPaymentRepository} from "@/infrastructure/postgres/payments";
import {PaymentInitializationProcessor} from "@/processors/payment-initialization";
export class PaymentInitializationWorker {
  constructor(private readonly payments:PostgresPaymentRepository,private readonly processor:PaymentInitializationProcessor,private readonly batchSize=20) {}
  async runOnce(){const work=await this.payments.findInitializationWork(this.batchSize);for(const payment of work)await this.processor.process(payment.id);return work.length;}
}
