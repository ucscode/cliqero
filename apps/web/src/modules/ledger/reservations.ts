import {newId} from "@/kernel/ids";
import type {Money} from "@/modules/money/money";
import type {SqlExecutor} from "@/infrastructure/postgres/database";

export interface FundsReservation {id:string;withdrawalId:string;accountId:string;amount:Money;}
export class LedgerFundsReservationService {
  constructor(private readonly sql:SqlExecutor){}
  async reserve(input:{withdrawalId:string;accountId:string;amount:Money;correlationId:string}):Promise<FundsReservation>{
    await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`,[`withdrawal:${input.accountId}`]);
    const available=(await this.sql.query<{minor:string}>(`select (
      coalesce((select sum(case when entry.direction='credit' then entry.amount_minor else -entry.amount_minor end)
        from ledger_capability.entries entry left join ledger_capability.entry_settlements settlement on settlement.original_entry_id=entry.id
        where entry.account_id=$1 and entry.currency=$2 and entry.entry_type='purchase-earnings'
          and (entry.balance_state='available' or settlement.id is not null)),0)
      - coalesce((select sum(res.amount_minor) from ledger_capability.withdrawal_reservations res where res.account_id=$1 and res.currency=$2
        and (select event.kind from ledger_capability.withdrawal_reservation_events event where event.reservation_id=res.id order by event.created_at desc,event.id desc limit 1)='reserved'),0)
      )::bigint as minor`,[input.accountId,input.amount.currency])).rows[0];
    if(BigInt(available?.minor??"0")<input.amount.minorAmount)throw new Error("Insufficient available funds");
    const reservationId=newId();await this.sql.query(`insert into ledger_capability.withdrawal_reservations(id,withdrawal_id,account_id,amount_minor,currency) values($1,$2,$3,$4,$5)`,
      [reservationId,input.withdrawalId,input.accountId,input.amount.minorAmount.toString(),input.amount.currency]);
    await this.sql.query(`insert into ledger_capability.withdrawal_reservation_events(id,reservation_id,withdrawal_id,account_id,kind,amount_minor,currency,idempotency_key,correlation_id) values($1,$2,$3,$4,'reserved',$5,$6,$7,$8)`,
      [newId(),reservationId,input.withdrawalId,input.accountId,input.amount.minorAmount.toString(),input.amount.currency,`withdrawal:${input.withdrawalId}:reserved`,input.correlationId]);
    return {id:reservationId,withdrawalId:input.withdrawalId,accountId:input.accountId,amount:input.amount};
  }
  async releaseOrComplete(input:{withdrawalId:string;accountId:string;kind:"released"|"completed";correlationId:string}):Promise<void>{
    await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`,[`withdrawal:${input.accountId}`]);
    const row=(await this.sql.query<{id:string;amount_minor:string;currency:string}>(`select id,amount_minor,currency from ledger_capability.withdrawal_reservations where withdrawal_id=$1 and account_id=$2`,[input.withdrawalId,input.accountId])).rows[0];
    if(!row)throw new Error("Withdrawal reservation not found");
    const latest=(await this.sql.query<{kind:string}>(`select kind from ledger_capability.withdrawal_reservation_events where reservation_id=$1 order by created_at desc,id desc limit 1`,[row.id])).rows[0]?.kind;
    if(latest!=="reserved")return;
    await this.sql.query(`insert into ledger_capability.withdrawal_reservation_events(id,reservation_id,withdrawal_id,account_id,kind,amount_minor,currency,idempotency_key,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [newId(),row.id,input.withdrawalId,input.accountId,input.kind,row.amount_minor,row.currency,`withdrawal:${input.withdrawalId}:${input.kind}`,input.correlationId]);
  }
  async summarize(accountId:string){const rows=(await this.sql.query<{currency:string;reserved_minor:string;completed_minor:string}>(`select currency,
    sum(case when event.kind='reserved' then event.amount_minor when event.kind in ('released','completed') then -event.amount_minor else 0 end)::bigint reserved_minor,
    sum(case when event.kind='completed' then event.amount_minor else 0 end)::bigint completed_minor
    from ledger_capability.withdrawal_reservation_events event where event.account_id=$1 group by currency`,[accountId])).rows;return rows.map(row=>({currency:row.currency,reservedMinor:BigInt(row.reserved_minor),completedMinor:BigInt(row.completed_minor)}));}
}
