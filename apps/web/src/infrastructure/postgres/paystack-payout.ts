import type {SqlExecutor} from "./database";
import type {PaystackRecipientStore} from "@/modules/withdrawal/paystack-payout";
export class PostgresPaystackRecipientStore implements PaystackRecipientStore {
  constructor(private readonly sql:SqlExecutor){}
  async find(accountId:string,fingerprint:string){const row=(await this.sql.query<{recipient_code:string}>(`select recipient_code from payout_capability.paystack_recipients where account_id=$1 and destination_fingerprint=$2 and active=true`,[accountId,fingerprint])).rows[0];return row?.recipient_code??null;}
  async save(input:{accountId:string;fingerprint:string;recipientCode:string;bankCode:string;accountLast4:string;accountName:string}){await this.sql.query(`insert into payout_capability.paystack_recipients(account_id,destination_fingerprint,recipient_code,bank_code,account_last4,account_name) values($1,$2,$3,$4,$5,$6) on conflict(account_id,destination_fingerprint) do update set recipient_code=excluded.recipient_code,active=true`,[input.accountId,input.fingerprint,input.recipientCode,input.bankCode,input.accountLast4,input.accountName]);}
}
