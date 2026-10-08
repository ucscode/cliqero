import { newId } from "@/kernel/ids";
import type { Money } from "@/modules/money/money";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  FundsReservation,
  LedgerFundsReservationService,
} from "@/modules/ledger/reservations";

export class PostgresLedgerFundsReservationService implements LedgerFundsReservationService {
  constructor(private readonly sql: QueryExecutor) {}
  async reserve(input: {
    withdrawalId: string;
    accountId: string;
    amount: Money;
    correlationId: string;
  }): Promise<FundsReservation> {
    await this.lockAccount(input.accountId);
    await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `withdrawal:${input.accountId}`,
    ]);
    const available = (
      await this.sql.query<{ minor: string }>(
        `select (
      coalesce((select sum(case when entry.direction='credit' then entry.amount_minor else -entry.amount_minor end)
        from ledger_capability.entries entry left join ledger_capability.entry_settlements settlement on settlement.original_entry_id=entry.id
        where entry.account_id=(select id from identity_capability.accounts where uuid=$1) and entry.currency=$2 and entry.entry_type='purchase-earnings'
          and (entry.balance_state='available' or settlement.id is not null)),0)
      + coalesce((select sum(adjustment.amount_minor) from ledger_capability.earnings_adjustments adjustment
        where adjustment.account_id=(select id from identity_capability.accounts where uuid=$1)),0)
      - coalesce((select sum(debt.amount_minor) from ledger_capability.account_debt_entries debt
        where debt.account_id=(select id from identity_capability.accounts where uuid=$1) and debt.wallet='earnings' and debt.kind='settlement'),0)
      - coalesce((select sum(res.amount_minor) from ledger_capability.withdrawal_reservations res where res.account_id=(select id from identity_capability.accounts where uuid=$1) and res.currency=$2
        and (select event.kind from ledger_capability.withdrawal_reservation_events event where event.reservation_id=res.id order by event.created_at desc,event.id desc limit 1) in ('reserved','completed')),0)
      - coalesce((select sum(funding_reversal.earnings_wallet_minor) from funding_capability.funding_reversals funding_reversal where funding_reversal.account_id=(select id from identity_capability.accounts where uuid=$1)),0)
      )::bigint as minor`,
        [input.accountId, input.amount.currency],
      )
    ).rows[0];
    if (BigInt(available?.minor ?? "0") < input.amount.minorAmount)
      throw new Error("Insufficient available funds");
    const reservationId = newId();
    await this.sql.query(
      `insert into ledger_capability.withdrawal_reservations(uuid,withdrawal_id,account_id,amount_minor,currency) values($1,(select id from withdrawal_capability.withdrawals where uuid=$2),(select id from identity_capability.accounts where uuid=$3),$4,$5)`,
      [
        reservationId,
        input.withdrawalId,
        input.accountId,
        input.amount.minorAmount.toString(),
        input.amount.currency,
      ],
    );
    await this.sql.query(
      `insert into ledger_capability.withdrawal_reservation_events(uuid,reservation_id,withdrawal_id,account_id,kind,amount_minor,currency,idempotency_key,correlation_id) values($1,(select id from ledger_capability.withdrawal_reservations where uuid=$2),(select id from withdrawal_capability.withdrawals where uuid=$3),(select id from identity_capability.accounts where uuid=$4),'reserved',$5,$6,$7,$8)`,
      [
        newId(),
        reservationId,
        input.withdrawalId,
        input.accountId,
        input.amount.minorAmount.toString(),
        input.amount.currency,
        `withdrawal:${input.withdrawalId}:reserved`,
        input.correlationId,
      ],
    );
    return {
      id: reservationId,
      withdrawalId: input.withdrawalId,
      accountId: input.accountId,
      amount: input.amount,
    };
  }
  async available(accountId: string, currency: string): Promise<bigint> {
    await this.lockAccount(accountId);
    const row = (
      await this.sql.query<{ minor: string }>(
        `select (
      coalesce((select sum(case when entry.direction='credit' then entry.amount_minor else -entry.amount_minor end)
        from ledger_capability.entries entry left join ledger_capability.entry_settlements settlement on settlement.original_entry_id=entry.id
        where entry.account_id=(select id from identity_capability.accounts where uuid=$1) and entry.currency=$2 and entry.entry_type='purchase-earnings'
          and (entry.balance_state='available' or settlement.id is not null)),0)
      + coalesce((select sum(adjustment.amount_minor) from ledger_capability.earnings_adjustments adjustment
        where adjustment.account_id=(select id from identity_capability.accounts where uuid=$1)),0)
      - coalesce((select sum(debt.amount_minor) from ledger_capability.account_debt_entries debt
        where debt.account_id=(select id from identity_capability.accounts where uuid=$1) and debt.wallet='earnings' and debt.kind='settlement'),0)
      - coalesce((select sum(res.amount_minor) from ledger_capability.withdrawal_reservations res where res.account_id=(select id from identity_capability.accounts where uuid=$1) and res.currency=$2
        and (select event.kind from ledger_capability.withdrawal_reservation_events event where event.reservation_id=res.id order by event.created_at desc,event.id desc limit 1) in ('reserved','completed')),0)
      - coalesce((select sum(funding_reversal.earnings_wallet_minor) from funding_capability.funding_reversals funding_reversal where funding_reversal.account_id=(select id from identity_capability.accounts where uuid=$1)),0)
      )::bigint as minor`,
        [accountId, currency],
      )
    ).rows[0];
    return BigInt(row?.minor ?? "0");
  }
  async releaseOrComplete(input: {
    withdrawalId: string;
    accountId: string;
    kind: "released" | "completed";
    correlationId: string;
  }): Promise<void> {
    await this.lockAccount(input.accountId);
    await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `withdrawal:${input.accountId}`,
    ]);
    const row = (
      await this.sql.query<{ id: string; amount_minor: string; currency: string }>(
        `select r.uuid as id,r.amount_minor,r.currency from ledger_capability.withdrawal_reservations r where r.withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1) and r.account_id=(select id from identity_capability.accounts where uuid=$2)`,
        [input.withdrawalId, input.accountId],
      )
    ).rows[0];
    if (!row) throw new Error("Withdrawal reservation not found");
    const latest = (
      await this.sql.query<{ kind: string }>(
        `select kind from ledger_capability.withdrawal_reservation_events where reservation_id=(select id from ledger_capability.withdrawal_reservations where uuid=$1) order by created_at desc,id desc limit 1`,
        [row.id],
      )
    ).rows[0]?.kind;
    if (latest !== "reserved") return;
    await this.sql.query(
      `insert into ledger_capability.withdrawal_reservation_events(uuid,reservation_id,withdrawal_id,account_id,kind,amount_minor,currency,idempotency_key,correlation_id) values($1,(select id from ledger_capability.withdrawal_reservations where uuid=$2),(select id from withdrawal_capability.withdrawals where uuid=$3),(select id from identity_capability.accounts where uuid=$4),$5,$6,$7,$8,$9)`,
      [
        newId(),
        row.id,
        input.withdrawalId,
        input.accountId,
        input.kind,
        row.amount_minor,
        row.currency,
        `withdrawal:${input.withdrawalId}:${input.kind}`,
        input.correlationId,
      ],
    );
  }
  async recordPayoutReturn(input: {
    withdrawalId: string;
    accountId: string;
    correlationId: string;
    idempotencyKey: string;
  }) {
    await this.lockAccount(input.accountId);
    await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `withdrawal:${input.accountId}`,
    ]);
    const reservation = (
      await this.sql.query<{ id: string; amount_minor: string; currency: string }>(
        `select r.uuid id,r.amount_minor,r.currency
           from ledger_capability.withdrawal_reservations r
          where r.withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1)
            and r.account_id=(select id from identity_capability.accounts where uuid=$2)
          for update`,
        [input.withdrawalId, input.accountId],
      )
    ).rows[0];
    if (!reservation) throw new Error("Withdrawal reservation not found");
    const latest = (
      await this.sql.query<{ kind: string }>(
        `select kind from ledger_capability.withdrawal_reservation_events
          where reservation_id=(select id from ledger_capability.withdrawal_reservations where uuid=$1)
          order by created_at desc,id desc limit 1`,
        [reservation.id],
      )
    ).rows[0]?.kind;
    if (latest !== "completed") throw new Error("Only a completed payout can be returned");
    await this.sql.query(
      `insert into ledger_capability.withdrawal_reservation_events
        (uuid,reservation_id,withdrawal_id,account_id,kind,amount_minor,currency,idempotency_key,correlation_id)
       values($1,(select id from ledger_capability.withdrawal_reservations where uuid=$2),
         (select id from withdrawal_capability.withdrawals where uuid=$3),
         (select id from identity_capability.accounts where uuid=$4),'returned',$5,$6,$7,$8)`,
      [
        newId(),
        reservation.id,
        input.withdrawalId,
        input.accountId,
        reservation.amount_minor,
        reservation.currency,
        input.idempotencyKey,
        input.correlationId,
      ],
    );
  }
  async resize(input: {
    withdrawalId: string;
    accountId: string;
    amount: Money;
    correlationId: string;
  }) {
    await this.lockAccount(input.accountId);
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `withdrawal:${input.accountId}`,
    ]);
    const reservation = (
      await this.sql.query<{ id: string; amount_minor: string; currency: string; kind: string }>(
        `select r.uuid id,r.amount_minor,r.currency,
                (select e.kind from ledger_capability.withdrawal_reservation_events e
                  where e.reservation_id=r.id order by e.created_at desc,e.id desc limit 1) kind
           from ledger_capability.withdrawal_reservations r
          where r.withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1)
            and r.account_id=(select id from identity_capability.accounts where uuid=$2)
          for update of r`,
        [input.withdrawalId, input.accountId],
      )
    ).rows[0];
    if (!reservation || reservation.kind !== "reserved")
      throw new Error("Only an active withdrawal reservation can be adjusted");
    if (reservation.currency !== input.amount.currency)
      throw new Error("Withdrawal currency cannot be changed");
    const availableIncludingCurrent =
      (await this.available(input.accountId, input.amount.currency)) +
      BigInt(reservation.amount_minor);
    if (availableIncludingCurrent < input.amount.minorAmount)
      throw new Error("Insufficient available funds for the revised withdrawal amount");
    await this.sql.query(
      `update ledger_capability.withdrawal_reservations set amount_minor=$2
        where uuid=$1`,
      [reservation.id, input.amount.minorAmount.toString()],
    );
    const revision = newId();
    await this.sql.query(
      `insert into ledger_capability.withdrawal_reservation_events
        (uuid,reservation_id,withdrawal_id,account_id,kind,amount_minor,currency,idempotency_key,correlation_id)
       values($1,(select id from ledger_capability.withdrawal_reservations where uuid=$2),
         (select id from withdrawal_capability.withdrawals where uuid=$3),
         (select id from identity_capability.accounts where uuid=$4),'reserved',$5,$6,$7,$8)`,
      [
        revision,
        reservation.id,
        input.withdrawalId,
        input.accountId,
        input.amount.minorAmount.toString(),
        input.amount.currency,
        `withdrawal:${input.withdrawalId}:resize:${revision}`,
        input.correlationId,
      ],
    );
  }
  async remove(withdrawalId: string, accountId: string) {
    await this.lockAccount(accountId);
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `withdrawal:${accountId}`,
    ]);
    const reservation = (
      await this.sql.query<{ id: string; kind: string | null }>(
        `select r.id,(select e.kind from ledger_capability.withdrawal_reservation_events e
                       where e.reservation_id=r.id order by e.created_at desc,e.id desc limit 1) kind
           from ledger_capability.withdrawal_reservations r
          where r.withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1)
            and r.account_id=(select id from identity_capability.accounts where uuid=$2)
          for update`,
        [withdrawalId, accountId],
      )
    ).rows[0];
    if (!reservation) return;
    if (reservation.kind === "completed")
      throw new Error("A completed payout reservation is immutable and cannot be removed");
    // These rows are operational reservation state; withdrawal lifecycle/outbox records retain
    // the request history, while no provider payout evidence is stored in these tables.
    await this.sql.query(
      `delete from ledger_capability.withdrawal_reservation_events where reservation_id=$1`,
      [reservation.id],
    );
    await this.sql.query(`delete from ledger_capability.withdrawal_reservations where id=$1`, [
      reservation.id,
    ]);
  }
  async removeForRoot(withdrawalId: string, accountId: string) {
    await this.lockAccount(accountId);
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `withdrawal:${accountId}`,
    ]);
    const reservation = (
      await this.sql.query<{ id: string }>(
        `select r.id from ledger_capability.withdrawal_reservations r
          where r.withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1)
            and r.account_id=(select id from identity_capability.accounts where uuid=$2)
          for update`,
        [withdrawalId, accountId],
      )
    ).rows[0];
    if (!reservation) return;
    await this.sql.query(
      `delete from ledger_capability.withdrawal_reservation_events where reservation_id=$1`,
      [reservation.id],
    );
    await this.sql.query(`delete from ledger_capability.withdrawal_reservations where id=$1`, [
      reservation.id,
    ]);
  }
  async summarize(accountId: string) {
    const rows = (
      await this.sql.query<{ currency: string; reserved_minor: string; completed_minor: string }>(
        `with latest as (
          select distinct on (event.reservation_id) event.kind,event.amount_minor,event.currency
            from ledger_capability.withdrawal_reservation_events event
           where event.account_id=(select id from identity_capability.accounts where uuid=$1)
           order by event.reservation_id,event.created_at desc,event.id desc
        ) select currency,
          coalesce(sum(amount_minor) filter (where kind='reserved'),0)::bigint reserved_minor,
          coalesce(sum(amount_minor) filter (where kind='completed'),0)::bigint completed_minor
          from latest group by currency`,
        [accountId],
      )
    ).rows;
    return rows.map((row) => ({
      currency: row.currency,
      reservedMinor: BigInt(row.reserved_minor),
      completedMinor: BigInt(row.completed_minor),
    }));
  }

  private async lockAccount(accountId: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `wallet-transfer:${accountId}`,
    ]);
  }
}
