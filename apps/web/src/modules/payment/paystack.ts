import { createHmac,timingSafeEqual } from "node:crypto";
import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type { PaymentInitialization,PaymentProvider,PaymentVerification } from "./payment";

export interface PaystackConfiguration {secretKey:string;apiBaseUrl:string;callbackUrl?:string;}
export type PaystackHttpClient=(input:string|URL,init?:RequestInit)=>Promise<Response>;

interface PaystackEnvelope<T>{status:boolean;message:string;data:T;}
interface InitializeData{authorization_url:string;access_code:string;reference:string;}
interface TransactionData{id:number;status:string;reference:string;amount:number;currency:string;fees?:number|null;}

export class PaystackProvider implements PaymentProvider {
  readonly name="paystack";
  constructor(private readonly config:PaystackConfiguration,private readonly http:PaystackHttpClient=fetch) {}

  async initiate(input:{paymentId:Id;amount:Money;idempotencyKey:string;buyerEmail:string}):Promise<PaymentInitialization> {
    if(input.amount.minorAmount<=0n)throw new Error("Paystack amount must be positive");
    const reference=`cliqero-${input.paymentId}`;
    const body:Record<string,string>={email:input.buyerEmail,amount:toPaystackSubunit(input.amount),currency:input.amount.currency,reference};
    if(this.config.callbackUrl)body.callback_url=this.config.callbackUrl;
    const result=await this.request<InitializeData>("/transaction/initialize",{method:"POST",body:JSON.stringify(body)});
    if(result.reference!==reference)throw new Error("Paystack returned an unexpected transaction reference");
    return {reference:result.reference,authorizationUrl:result.authorization_url,accessCode:result.access_code};
  }

  async verify(input:{reference:string;expectedAmount:Money}):Promise<PaymentVerification> {
    const data=await this.request<TransactionData>(`/transaction/verify/${encodeURIComponent(input.reference)}`,{method:"GET"});
    if(!Number.isSafeInteger(data.amount)||data.amount<0)throw new Error("Paystack returned an invalid amount");
    if(typeof data.reference!=="string"||typeof data.currency!=="string"||typeof data.status!=="string")throw new Error("Paystack verification response is invalid");
    if(data.fees!==undefined&&data.fees!==null&&(!Number.isSafeInteger(data.fees)||data.fees<0))throw new Error("Paystack returned an invalid fee");
    return {verified:data.status==="success",status:data.status,reference:data.reference,
      amount:Money.of(BigInt(data.amount),data.currency),providerTransactionId:String(data.id),
      providerFee:data.fees===undefined||data.fees===null?undefined:Money.of(BigInt(data.fees),data.currency)};
  }

  verifyWebhookSignature(rawBody:Uint8Array,signature:string|null):boolean {
    if(!signature||!/^[a-f0-9]{128}$/i.test(signature))return false;
    const expected=createHmac("sha512",this.config.secretKey).update(rawBody).digest();
    const presented=Buffer.from(signature,"hex");
    return presented.length===expected.length&&timingSafeEqual(presented,expected);
  }

  private async request<T>(path:string,init:RequestInit):Promise<T> {
    const response=await this.http(new URL(path,this.config.apiBaseUrl),{...init,headers:{authorization:`Bearer ${this.config.secretKey}`,"content-type":"application/json"}});
    let envelope:PaystackEnvelope<T>;
    try{envelope=await response.json() as PaystackEnvelope<T>;}catch{throw new Error(`Paystack returned invalid JSON (${response.status})`);}
    if(!response.ok||!envelope.status||!envelope.data)throw new Error(`Paystack request failed (${response.status}): ${envelope.message||"Unknown error"}`);
    return envelope.data;
  }
}

export function toPaystackSubunit(money:Money):string{return money.minorAmount.toString();}
