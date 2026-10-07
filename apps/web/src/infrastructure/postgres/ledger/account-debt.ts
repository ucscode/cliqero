import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  AccountDebtDraft,
  AccountDebtEntry,
  AccountDebtPosition,
  AccountDebtRepository,
} from "@/modules/ledger/account-debt";

type DebtRow = {
  id: string;
  account_id: string;
  kind: AccountDebtEntry["kind"];
  amount_minor: string;
  wallet: AccountDebtEntry["wallet"];
  source_kind: string;
  source_id: string;
  reason: string;
  actor_kind: "account" | "system";
  actor_id: string | null;
  actor_system: string | null;
  correlation_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  created_at: Date | string;
  created_at_cursor?: string;
};

export class PostgresAccountDebtRepository implements AccountDebtRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async lockAccount(accountId: string) {
    await this.sql.query(
      `select pg_advisory_xact_lock(hashtextextended('wallet-transfer:' || uuid::text, 0))
         from identity_capability.accounts where uuid=$1`,
      [accountId],
    );
    await this.sql.query(
      `select pg_advisory_xact_lock(hashtextextended('account-debt:' || uuid::text, 0))
         from identity_capability.accounts where uuid=$1`,
      [accountId],
    );
  }

  async balance(accountId: string) {
    const result = await this.sql.query<{ balance_minor: string }>(
      `select coalesce(sum(case when kind='increase' then amount_minor else -amount_minor end),0)::text balance_minor
         from ledger_capability.account_debt_entries
        where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [accountId],
    );
    return BigInt(result.rows[0]?.balance_minor ?? "0");
  }

  async findByIdempotencyKey(key: string) {
    const row = (
      await this.sql.query<DebtRow>(
        `select entry.uuid id,account.uuid account_id,entry.kind,entry.amount_minor,entry.wallet,
                entry.source_kind,entry.source_id,entry.reason,entry.actor_kind,actor.uuid actor_id,entry.actor_system,
                entry.correlation_id,entry.idempotency_key,entry.request_fingerprint,entry.created_at,
                to_char(entry.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at_cursor
           from ledger_capability.account_debt_entries entry
           join identity_capability.accounts account on account.id=entry.account_id
           left join identity_capability.accounts actor on actor.id=entry.actor_id
          where entry.idempotency_key=$1`,
        [key],
      )
    ).rows[0];
    return row ? { ...this.map(row), requestFingerprint: row.request_fingerprint } : null;
  }

  async append(entry: AccountDebtDraft) {
    const row = (
      await this.sql.query<DebtRow>(
        `insert into ledger_capability.account_debt_entries
          (uuid,account_id,kind,amount_minor,wallet,source_kind,source_id,reason,actor_kind,actor_id,actor_system,
           correlation_id,idempotency_key,request_fingerprint)
         values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,$8,$9,
           (select id from identity_capability.accounts where uuid=$10),$11,$12,$13,$14)
         returning uuid id,(select uuid from identity_capability.accounts where id=account_id) account_id,
           kind,amount_minor,wallet,source_kind,source_id,reason,actor_kind,
           (select uuid from identity_capability.accounts where id=actor_id) actor_id,actor_system,
           correlation_id,idempotency_key,request_fingerprint,created_at`,
        [
          entry.id,
          entry.accountId,
          entry.kind,
          entry.amountMinor.toString(),
          entry.wallet,
          entry.sourceKind,
          entry.sourceId,
          entry.reason,
          entry.actor.kind,
          entry.actor.kind === "account" ? entry.actor.id : null,
          entry.actor.kind === "system" ? entry.actor.id : null,
          entry.correlationId,
          entry.idempotencyKey,
          entry.requestFingerprint,
        ],
      )
    ).rows[0];
    if (!row) throw new Error("Account debt entry was not persisted");
    return this.map(row);
  }

  async list(accountId: string, limit: number, cursor?: AccountDebtPosition) {
    const rows = (
      await this.sql.query<DebtRow>(
        `select entry.uuid id,account.uuid account_id,entry.kind,entry.amount_minor,entry.wallet,
                entry.source_kind,entry.source_id,entry.reason,entry.actor_kind,actor.uuid actor_id,entry.actor_system,
                entry.correlation_id,entry.idempotency_key,entry.request_fingerprint,entry.created_at,
                to_char(entry.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at_cursor
           from ledger_capability.account_debt_entries entry
           join identity_capability.accounts account on account.id=entry.account_id
           left join identity_capability.accounts actor on actor.id=entry.actor_id
          where account.uuid=$1 and ($2::timestamptz is null or (entry.created_at,entry.uuid)<($2::timestamptz,$3::uuid))
          order by entry.created_at desc,entry.uuid desc limit $4`,
        [
          accountId,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          Math.max(1, Math.min(limit, 100) + 1),
        ],
      )
    ).rows;
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    return {
      items: visible.map((row) => this.map(row)),
      hasMore,
      nextPosition:
        hasMore && visible.length
          ? { createdAt: visible.at(-1)!.created_at_cursor!, id: visible.at(-1)!.id }
          : null,
    };
  }

  private map(row: DebtRow): AccountDebtEntry {
    return {
      id: row.id,
      accountId: row.account_id,
      kind: row.kind,
      amountMinor: BigInt(row.amount_minor),
      wallet: row.wallet,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      reason: row.reason,
      actor:
        row.actor_kind === "system"
          ? { kind: "system", id: row.actor_system! }
          : { kind: "account", id: row.actor_id! },
      correlationId: row.correlation_id,
      idempotencyKey: row.idempotency_key,
      createdAt: new Date(row.created_at),
    };
  }
}
