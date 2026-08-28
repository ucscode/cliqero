import {randomUUID} from "node:crypto";
import {getContainer} from "@/infrastructure/container";
import {AuditedFactHandler,PurchaseCompletedDistributionHandler} from "./handlers";
import {JsonConsoleLogger,OutboxDispatcher,OutboxHandlerRegistry} from "./dispatcher";
import {PaystackChargeSucceededHandler} from "./paystack-handler";

const container=getContainer();
const workerId=process.env.OUTBOX_WORKER_ID??`outbox-${randomUUID()}`;
const logger=new JsonConsoleLogger();
const handlers=new OutboxHandlerRegistry().register(new AuditedFactHandler()).register(new PurchaseCompletedDistributionHandler(container.purchaseDistribution));
if(container.paystack)handlers.register(new PaystackChargeSucceededHandler(container.providerEvents,container.payments,container.paymentCompletion));
const dispatcher=new OutboxDispatcher(workerId,container.outbox,handlers,logger,{
  batchSize:positiveInteger(process.env.OUTBOX_BATCH_SIZE,20),pollMilliseconds:positiveInteger(process.env.OUTBOX_POLL_MS,1000),
  staleAfterMilliseconds:positiveInteger(process.env.OUTBOX_STALE_AFTER_MS,300_000),
});
const abortController=new AbortController();
for(const signal of ["SIGTERM","SIGINT"] as const)process.once(signal,()=>abortController.abort());
try{await dispatcher.run(abortController.signal);}finally{await container.database.close();}

function positiveInteger(value:string|undefined,fallback:number):number{const parsed=Number(value);return Number.isInteger(parsed)&&parsed>0?parsed:fallback;}
