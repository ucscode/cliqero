import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {Money} from "@/modules/money/money";
import type {Withdrawal} from "@/modules/withdrawal/withdrawal";
import type {PayoutProvider,PayoutResult,PayoutProviderCapabilities} from "@/modules/withdrawal/provider";

export interface PaystackPayoutConfiguration {secretKey:string;apiBaseUrl:string;enabled:boolean;}
export type PaystackPayoutHttpClient=(input:string|URL,init?:RequestInit)=>Promise<Response>;
export interface PaystackRecipientStore {find(accountId:string,fingerprint:string):Promise<string|null>;save(input:{accountId:string;fingerprint:string;recipientCode:string;bankCode:string;accountLast4:string;accountName:string}):Promise<void>;}
export interface PaystackBankDestination {bankCode:string;accountNumber:string;accountName:string;}

export function parsePaystackBankDestination(reference:string):PaystackBankDestination {
  let value:unknown; try { value=JSON.parse(reference); } catch { throw new Error("Paystack bank destination is invalid"); }
  if(!value || typeof value!=="object") throw new Error("Paystack bank destination is invalid");
  const v=value as Record<string,unknown>;
  if(typeof v.bankCode!=="string"||!/^[0-9A-Za-z]{2,10}$/.test(v.bankCode)||typeof v.accountNumber!=="string"||!/^[0-9]{10}$/.test(v.accountNumber)||typeof v.accountName!=="string"||v.accountName.trim().length<2) throw new Error("Paystack bank destination is invalid");
  return {bankCode:v.bankCode,accountNumber:v.accountNumber,accountName:v.accountName.trim()};
}
export function toPaystackTransferReference(idempotencyKey:string):string { const value=idempotencyKey.toLowerCase().replace(/[^a-z0-9_-]/g,"-"); return value.length>=16&&value.length<=50?value:`cliqero-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0,32)}`; }

interface Envelope<T>{status:boolean;message:string;data:T}
interface Recipient {recipient_code:string;active?:boolean}
interface Transfer {reference:string;transfer_code?:string;status:string;amount:number;currency:string}

export class PaystackPayoutProvider implements PayoutProvider {
  readonly name="paystack";
  readonly capabilities:PayoutProviderCapabilities={currencies:["NGN"],destinationTypes:["bank"],supportsVerification:true};
  constructor(private readonly config:PaystackPayoutConfiguration,private readonly recipients:PaystackRecipientStore,private readonly http:PaystackPayoutHttpClient=fetch){}
  verifyWebhookSignature(rawBody:Uint8Array,signature:string|null){if(!signature||!/^[a-f0-9]{128}$/i.test(signature))return false;const expected=createHmac("sha512",this.config.secretKey).update(rawBody).digest();const presented=Buffer.from(signature,"hex");return presented.length===expected.length&&timingSafeEqual(presented,expected);}
  async submitPayout(input:{withdrawal:Withdrawal;idempotencyKey:string}):Promise<PayoutResult>{
    const destination=parsePaystackBankDestination(input.withdrawal.destinationReference);
    const fingerprint=createHash("sha256").update(`${destination.bankCode}:${destination.accountNumber}:${destination.accountName.toLowerCase()}`).digest("hex");
    let recipient=await this.recipients.find(input.withdrawal.accountId,fingerprint);
    if(!recipient){
      const data=await this.request<Recipient>("/transferrecipient",{method:"POST",body:JSON.stringify({type:"nuban",name:destination.accountName,account_number:destination.accountNumber,bank_code:destination.bankCode,currency:"NGN"})});
      if(typeof data.recipient_code!=="string"||!data.recipient_code) throw new Error("Paystack recipient response is invalid");
      recipient=data.recipient_code;
      await this.recipients.save({accountId:input.withdrawal.accountId,fingerprint,recipientCode:recipient,bankCode:destination.bankCode,accountLast4:destination.accountNumber.slice(-4),accountName:destination.accountName});
    }
    const data=await this.request<Transfer>("/transfer",{method:"POST",body:JSON.stringify({source:"balance",amount:input.withdrawal.amount.minorAmount.toString(),recipient,reference:toPaystackTransferReference(input.idempotencyKey),reason:`Cliqero withdrawal ${input.withdrawal.id}`,currency:"NGN"})});
    return this.mapTransfer(data,input.withdrawal);
  }
  async verifyPayout(input:{providerReference:string;withdrawal:Withdrawal}):Promise<PayoutResult>{
    const data=await this.request<Transfer>(`/transfer/verify/${encodeURIComponent(input.providerReference)}`,{method:"GET"});
    return this.mapTransfer(data,input.withdrawal);
  }
  private mapTransfer(data:Transfer,withdrawal:Withdrawal):PayoutResult {
    if(typeof data.reference!=="string"||typeof data.status!=="string"||!Number.isSafeInteger(data.amount)||typeof data.currency!=="string") throw new Error("Paystack transfer response is invalid");
    const reference=data.reference;
    if(data.status==="success") return {kind:"succeeded",providerReference:reference,providerTransactionReference:data.transfer_code,amount:Money.of(BigInt(data.amount),data.currency),currency:data.currency};
    if(data.status==="pending"||data.status==="otp"||data.status==="received") return {kind:"pending",providerReference:reference,reason:`Paystack transfer status: ${data.status}`};
    if(data.status==="failed"||data.status==="reversed"||data.status==="abandoned"||data.status==="blocked"||data.status==="rejected") return {kind:"failed",providerReference:reference,category:"provider_rejection",reason:`Paystack transfer status: ${data.status}`};
    return {kind:"unknown",providerReference:reference,reason:`Unknown Paystack transfer status: ${data.status}`};
  }
  private async request<T>(path:string,init:RequestInit):Promise<T>{
    let response:Response; try { response=await this.http(new URL(path,this.config.apiBaseUrl),{...init,headers:{authorization:`Bearer ${this.config.secretKey}`,"content-type":"application/json"}}); } catch(error) { throw Object.assign(new Error(error instanceof Error?error.message:"Paystack request failed"),{unknownOutcome:path==="/transfer"}); }
    let envelope:Envelope<T>; try { envelope=await response.json() as Envelope<T>; } catch { throw new Error(`Paystack returned invalid JSON (${response.status})`); }
    if(!response.ok||!envelope.status||envelope.data===undefined){const error=Object.assign(new Error(`Paystack request failed (${response.status}): ${envelope.message||"Unknown error"}`),{failureCategory:(response.status>=500||response.status===429)?"retryable_technical":"provider_rejection"});throw error;}
    return envelope.data;
  }
}
