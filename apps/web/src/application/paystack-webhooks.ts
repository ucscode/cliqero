import {createHash} from "node:crypto";
import {newId} from "@/kernel/ids";
import type {UnitOfWork} from "@/kernel/unit-of-work";
import type {EventOutbox} from "@/kernel/events";
import type {PaystackProvider} from "@/modules/payment/paystack";
import type {PostgresProviderEventRepository} from "@/infrastructure/postgres/provider-events";

interface PaystackChargeSuccess {event:"charge.success";data:{id:number;reference:string;amount:number;currency:string;status:string};}
export class PaystackWebhookIngress {
  constructor(private readonly provider:PaystackProvider,private readonly events:PostgresProviderEventRepository,
    private readonly outbox:EventOutbox,private readonly uow:UnitOfWork){}
  async ingest(rawBody:Uint8Array,signature:string|null):Promise<{authenticated:boolean;duplicate?:boolean;accepted?:boolean}> {
    if(!this.provider.verifyWebhookSignature(rawBody,signature))return {authenticated:false};
    let payload:unknown;try{payload=JSON.parse(Buffer.from(rawBody).toString("utf8"));}catch{throw new Error("Paystack webhook JSON is invalid");}
    if(!isChargeSuccess(payload)){
      const eventType=isObject(payload)&&typeof payload.event==="string"?payload.event:"unknown";
      const recorded=await this.events.record({id:newId(),providerName:"paystack",eventKey:`${eventType}:${createHash("sha256").update(rawBody).digest("hex")}`,
        eventType,providerReference:null,amountMinor:null,currency:null,payload});
      if(recorded.created)await this.events.markIgnored(recorded.record.id,"Authenticated Paystack event has no current commerce consequence");
      return {authenticated:true,accepted:false};
    }
    const eventKey=`charge.success:${payload.data.id}`;const id=newId();
    return this.uow.transaction(async()=>{
      const recorded=await this.events.record({id,providerName:"paystack",eventKey,eventType:payload.event,
        providerReference:payload.data.reference,amountMinor:String(payload.data.amount),currency:payload.data.currency,payload});
      if(!recorded.created)return {authenticated:true,accepted:true,duplicate:true};
      await this.outbox.append([{id:newId(),name:"payment.paystack.charge-succeeded",aggregateId:recorded.record.id,
        correlationId:recorded.record.id,occurredAt:new Date(),payload:{providerEventId:recorded.record.id}}]);
      return {authenticated:true,accepted:true,duplicate:false};
    });
  }
}
function isObject(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null;}
function isChargeSuccess(value:unknown):value is PaystackChargeSuccess {
  if(!isObject(value)||value.event!=="charge.success"||!isObject(value.data))return false;
  return Number.isSafeInteger(value.data.id)&&typeof value.data.reference==="string"&&value.data.reference.length>0&&
    Number.isSafeInteger(value.data.amount)&&Number(value.data.amount)>=0&&typeof value.data.currency==="string"&&typeof value.data.status==="string";
}
