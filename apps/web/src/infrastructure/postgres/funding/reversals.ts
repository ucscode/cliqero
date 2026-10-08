import { Buffer } from "node:buffer";
import { PublicApplicationError } from "@/kernel/errors";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { FundingReversal, FundingReversalRepository } from "@/modules/funding/reversals";

type Row = {
  id: string;
  funding_id: string;
  account_id: string;
  amount_minor: string;
  currency: "USD";
  provider_collection_amount_minor: string | null;
  provider_collection_currency: string | null;
  source: FundingReversal["source"];
  reason: string;
  provider_reference: string | null;
  provider_event_id: string | null;
  idempotency_key: string;
  correlation_id: string;
  created_by: string | null;
  actor_system: string | null;
  pending_credit_minor: string;
  funding_wallet_minor: string;
  earnings_wallet_minor: string;
  debt_minor: string;
  created_at: Date | string;
  cursor_at?: string;
};

export class PostgresFundingReversalRepository implements FundingReversalRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async lockIdempotencyKey(key: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `funding-reversal:${key}`,
    ]);
  }
  async lockAccount(accountId: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `wallet-transfer:${accountId}`,
    ]);
  }

  async findById(id: string) {
    const row = (await this.sql.query<Row>(`${projection} where reversal.uuid=$1`, [id])).rows[0];
    return row ? project(row) : null;
  }
  async findByIdempotencyKey(key: string) {
    const row = (
      await this.sql.query<Row>(`${projection} where reversal.idempotency_key=$1`, [key])
    ).rows[0];
    return row ? project(row) : null;
  }
  async list(input: Parameters<FundingReversalRepository["list"]>[0]) {
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const rows = (
      await this.sql.query<Row>(
        `${projection}
        where ($1::uuid is null or account.uuid=$1)
          and ($2::uuid is null or funding.uuid=$2)
          and ($3::text is null or reversal.source=$3)
          and ($4::timestamptz is null or (reversal.created_at,reversal.uuid)<($4,$5::uuid))
        order by reversal.created_at desc,reversal.uuid desc limit $6`,
        [
          input.accountId ?? null,
          input.fundingId ?? null,
          input.source ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          Math.min(100, Math.max(1, input.limit)) + 1,
        ],
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(project),
      nextCursor:
        rows.length > input.limit && last
          ? Buffer.from(
              JSON.stringify({ createdAt: String(last.cursor_at ?? last.created_at), id: last.id }),
            ).toString("base64url")
          : null,
    };
  }
  async remaining(fundingId: string) {
    const row = (
      await this.sql.query<{ amount: string }>(
        `select (f.canonical_amount_minor-coalesce(sum(r.amount_minor),0))::text amount
         from funding_capability.funding_transactions f left join funding_capability.funding_reversals r on r.funding_id=f.id
        where f.uuid=$1 group by f.id`,
        [fundingId],
      )
    ).rows[0];
    return BigInt(row?.amount ?? "0");
  }
  async lockForReversal(fundingId: string, accountId: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `wallet-transfer:${accountId}`,
    ]);
    const funding = (
      await this.sql.query<{
        amount: string;
        collection_amount: string;
        collection_currency: string;
        provider_origin: boolean;
        state: string;
      }>(
        `select f.canonical_amount_minor::text amount,f.collection_amount_minor::text collection_amount,f.collection_currency,f.state, not exists(select 1 from funding_capability.administrative_fundings a where a.uuid=f.uuid) provider_origin
         from funding_capability.funding_transactions f where f.uuid=$1 and f.account_id=(select id from identity_capability.accounts where uuid=$2) for update`,
        [fundingId, accountId],
      )
    ).rows[0];
    const credit = (
      await this.sql.query<{ amount: string; state: "pending" | "available" | "cancelled" }>(
        `select amount_minor::text amount,state from wallet_capability.credits where funding_id=(select id from funding_capability.funding_transactions where uuid=$1) for update`,
        [fundingId],
      )
    ).rows[0];
    return {
      providerOrigin: funding?.provider_origin === true,
      state: funding?.state ?? "missing",
      fundingAmountMinor: BigInt(funding?.amount ?? "0"),
      collectionAmountMinor: BigInt(funding?.collection_amount ?? "0"),
      collectionCurrency: funding?.collection_currency ?? "USD",
      creditAmountMinor: BigInt(credit?.amount ?? "0"),
      creditState: credit?.state ?? null,
    };
  }
  async providerRefundedCollection(fundingId: string, currency: string) {
    const row = (
      await this.sql.query<{ amount: string }>(
        `select coalesce(sum(provider_collection_amount_minor),0)::text amount
           from funding_capability.funding_reversals
          where funding_id=(select id from funding_capability.funding_transactions where uuid=$1)
            and source='provider_event' and provider_collection_currency=$2`,
        [fundingId, currency],
      )
    ).rows[0];
    return BigInt(row?.amount ?? "0");
  }
  async reducePendingCredit(fundingId: string, remainingMinor: bigint) {
    await this.sql.query(
      `update wallet_capability.credits set amount_minor=case when $2::bigint=0 then amount_minor else $2::bigint end,state=case when $2::bigint=0 then 'cancelled' else state end
        where funding_id=(select id from funding_capability.funding_transactions where uuid=$1) and state='pending'`,
      [fundingId, remainingMinor.toString()],
    );
  }
  async availableFunding(accountId: string) {
    const row = (
      await this.sql.query<{ amount: string }>(
        `select greatest(0,
          coalesce((select sum(amount_minor) from wallet_capability.credits where account_id=a.id and state='available'),0)
          + coalesce((select sum(case when direction='credit' then amount_minor else -amount_minor end) from wallet_capability.transfer_entries e join wallet_capability.transfers t on t.id=e.transfer_id where t.account_id=a.id and e.wallet='funding'),0)
          + coalesce((select sum(amount_minor) from wallet_capability.funding_adjustments where account_id=a.id),0)
          - coalesce((select sum(amount_minor) from wallet_capability.debits where account_id=a.id),0)
          - coalesce((select sum(amount_minor) from ledger_capability.account_debt_entries where account_id=a.id and wallet='funding' and kind='settlement'),0)
          - coalesce((select sum(funding_wallet_minor) from funding_capability.funding_reversals where account_id=a.id),0)
        )::text amount from identity_capability.accounts a where a.uuid=$1`,
        [accountId],
      )
    ).rows[0];
    return BigInt(row?.amount ?? "0");
  }
  async availableEarnings(accountId: string) {
    const row = (
      await this.sql.query<{ amount: string }>(
        `select ledger_capability.available_earnings_minor(a.id,'USD')::text amount
           from identity_capability.accounts a where a.uuid=$1`,
        [accountId],
      )
    ).rows[0];
    return BigInt(row?.amount ?? "0");
  }
  async create(input: Omit<FundingReversal, "createdAt">) {
    const row = (
      await this.sql.query<Row>(
        `insert into funding_capability.funding_reversals
        (uuid,funding_id,account_id,amount_minor,currency,provider_collection_amount_minor,provider_collection_currency,source,reason,provider_reference,provider_event_id,idempotency_key,request_fingerprint,correlation_id,created_by,actor_system,pending_credit_minor,funding_wallet_minor,earnings_wallet_minor,debt_minor)
       values($1,(select id from funding_capability.funding_transactions where uuid=$2),(select id from identity_capability.accounts where uuid=$3),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,(select id from identity_capability.accounts where uuid=$15),$16,$17,$18,$19,$20)
       returning uuid id,(select uuid from funding_capability.funding_transactions where id=funding_id) funding_id,(select uuid from identity_capability.accounts where id=account_id) account_id,amount_minor,currency,provider_collection_amount_minor,provider_collection_currency,source,reason,provider_reference,provider_event_id,idempotency_key,correlation_id,(select uuid from identity_capability.accounts where id=created_by) created_by,actor_system,pending_credit_minor,funding_wallet_minor,earnings_wallet_minor,debt_minor,created_at`,
        [
          input.id,
          input.fundingId,
          input.accountId,
          input.amountMinor,
          input.currency,
          input.providerCollectionAmountMinor,
          input.providerCollectionCurrency,
          input.source,
          input.reason,
          input.providerReference,
          input.providerEventId,
          input.idempotencyKey,
          requestFingerprint(input),
          input.correlationId,
          input.createdBy,
          input.actorSystem,
          input.recovery.pendingCreditMinor,
          input.recovery.fundingWalletMinor,
          input.recovery.earningsWalletMinor,
          input.recovery.debtMinor,
        ],
      )
    ).rows[0];
    if (!row) throw new Error("Funding reversal was not persisted");
    return project(row);
  }
  async summary(fundingId: string) {
    const row = (
      await this.sql.query<{ canonical: string; reversed: string; provider_origin: boolean }>(
        `select f.canonical_amount_minor::text canonical,coalesce(sum(r.amount_minor),0)::text reversed,
              not exists(select 1 from funding_capability.administrative_fundings a where a.uuid=f.uuid) provider_origin
         from funding_capability.funding_transactions f left join funding_capability.funding_reversals r on r.funding_id=f.id
        where f.uuid=$1 group by f.id`,
        [fundingId],
      )
    ).rows[0];
    const canonical = BigInt(row?.canonical ?? "0"),
      reversed = BigInt(row?.reversed ?? "0");
    return {
      state:
        reversed === 0n
          ? ("none" as const)
          : reversed === canonical
            ? ("full" as const)
            : ("partial" as const),
      reversedAmountMinor: reversed.toString(),
      remainingAmountMinor: row?.provider_origin ? (canonical - reversed).toString() : "0",
    };
  }
}

const projection = `select reversal.uuid id,funding.uuid funding_id,account.uuid account_id,reversal.amount_minor,reversal.currency,reversal.provider_collection_amount_minor::text provider_collection_amount_minor,reversal.provider_collection_currency,reversal.source,reversal.reason,reversal.provider_reference,reversal.provider_event_id,reversal.idempotency_key,reversal.correlation_id,actor.uuid created_by,reversal.actor_system,reversal.pending_credit_minor,reversal.funding_wallet_minor,reversal.earnings_wallet_minor,reversal.debt_minor,reversal.created_at,to_char(reversal.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at
 from funding_capability.funding_reversals reversal join funding_capability.funding_transactions funding on funding.id=reversal.funding_id join identity_capability.accounts account on account.id=reversal.account_id left join identity_capability.accounts actor on actor.id=reversal.created_by`;
function project(row: Row): FundingReversal {
  return {
    id: row.id,
    fundingId: row.funding_id,
    accountId: row.account_id,
    amountMinor: String(row.amount_minor),
    currency: row.currency,
    providerCollectionAmountMinor: row.provider_collection_amount_minor,
    providerCollectionCurrency: row.provider_collection_currency,
    source: row.source,
    reason: row.reason,
    providerReference: row.provider_reference,
    providerEventId: row.provider_event_id,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    createdBy: row.created_by,
    actorSystem: row.actor_system,
    recovery: {
      pendingCreditMinor: String(row.pending_credit_minor),
      fundingWalletMinor: String(row.funding_wallet_minor),
      earningsWalletMinor: String(row.earnings_wallet_minor),
      debtMinor: String(row.debt_minor),
    },
    createdAt: new Date(row.created_at),
  };
}
function decodeCursor(value: string) {
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const v = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      Object.keys(v).sort().join(",") !== "createdAt,id" ||
      typeof v.createdAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(v.createdAt) ||
      !Number.isFinite(Date.parse(v.createdAt)) ||
      typeof v.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)
    )
      throw new Error();
    return { createdAt: v.createdAt, id: v.id };
  } catch {
    throw new PublicApplicationError("Invalid funding reversal cursor.", "invalid_cursor", 400);
  }
}
function requestFingerprint(input: Omit<FundingReversal, "createdAt">) {
  return JSON.stringify([
    input.fundingId,
    input.amountMinor,
    input.reason,
    input.providerReference,
  ]);
}
