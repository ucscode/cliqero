import { randomUUID } from "node:crypto";
import { Money } from "@/modules/money/money";
import type { QueryExecutor } from "../shared/database";
import type {
  FundingRepository,
  FundingHistoryPage,
  FundingState,
  FundingTransaction,
} from "@/modules/funding/funding";
import { DuplicateProviderTransactionError } from "@/kernel/errors";

export class PostgresFundingRepository implements FundingRepository {
  constructor(private sql: QueryExecutor) {}
  findById(id: string, o?: { forUpdate?: boolean }) {
    return this.find("f.uuid=$1", [id], o);
  }
  findByIdempotency(accountId: string, key: string) {
    return this.find(
      "f.account_id=(select id from identity_capability.accounts where uuid=$1) and f.idempotency_key=$2",
      [accountId, key],
    );
  }
  findByProviderReference(provider: string, reference: string) {
    return this.find("f.provider_name=$1 and f.provider_reference=$2", [provider, reference]);
  }
  findByProviderTransactionId(provider: string, transactionId: string) {
    return this.find("f.provider_name=$1 and f.provider_transaction_id=$2", [
      provider,
      transactionId,
    ]);
  }
  async findActiveForAccount(accountId: string) {
    const rows = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id,a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id where a.uuid=$1 and f.state in ('initialization_pending','initializing','awaiting_payment','verification_pending') order by f.updated_at desc,f.id desc`,
        [accountId],
      )
    ).rows;
    return rows.map((row) => this.map(row));
  }
  async findHistoryForAccount(input: {
    accountId: string;
    cursor?: string;
    limit?: number;
    state?: FundingState;
    active?: boolean;
  }): Promise<FundingHistoryPage> {
    const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
    const rows = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id,a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id
         where a.uuid=$1 and ($2::timestamptz is null or f.created_at < $2)
           and ($3::text is null or f.state=$3)
           and (not $4::boolean or f.state in ('initialization_pending','initializing','awaiting_payment','verification_pending'))
         order by f.created_at desc,f.id desc limit $5`,
        [
          input.accountId,
          input.cursor ?? null,
          input.state ?? null,
          input.active ?? false,
          limit + 1,
        ],
      )
    ).rows;
    const items = rows.slice(0, limit).map((row) => this.map(row));
    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.createdAt?.toISOString() ?? null) : null,
    };
  }
  async findExpired(providerName: string, now: Date, limit = 50) {
    const rows = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id,a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id
         where f.provider_name=$1 and f.state='awaiting_payment' and f.provider_initialization->>'expiresAt' is not null and f.provider_initialization->>'expiresAt' <= $2
         order by f.updated_at,f.id limit $3`,
        [providerName, now.toISOString(), Math.max(1, Math.min(limit, 50))],
      )
    ).rows;
    return rows.map((row) => this.map(row));
  }
  async recordCancellation(fundingId: string, accountId: string, previousState: FundingState) {
    await this.sql.query(
      `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
       values((select id from identity_capability.accounts where uuid=$1),'funding.cancelled','funding_transaction',$2,$3::jsonb,$4::jsonb,$5)`,
      [
        accountId,
        fundingId,
        JSON.stringify({ state: previousState }),
        JSON.stringify({ state: "cancelled" }),
        randomUUID(),
      ],
    );
  }
  async findWork(state: FundingState, limit = 50) {
    const rows = (
      await this.sql.query<any>(
        `select uuid as id from funding_capability.funding_transactions where state=$1 order by updated_at,id limit $2`,
        [state, limit],
      )
    ).rows;
    return (await Promise.all(rows.map((r: any) => this.findById(r.id)))).filter(
      Boolean,
    ) as FundingTransaction[];
  }
  async findVerificationWork(now: Date, limit = 50) {
    const rows = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id,a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id where f.state='verification_pending' and (f.next_verification_at is null or f.next_verification_at <= $1) order by f.next_verification_at nulls first,f.updated_at,f.id limit $2`,
        [now, Math.max(1, Math.min(limit, 50))],
      )
    ).rows;
    return rows.map((row) => this.map(row));
  }
  async findInitializationWork(staleBefore: Date, limit = 50) {
    const rows = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id,a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id where f.state='initialization_pending' or (f.state='initializing' and coalesce(f.initialization_claimed_at,f.updated_at)<=$1) order by f.created_at,f.id limit $2`,
        [staleBefore, limit],
      )
    ).rows;
    return rows.map((row) => this.map(row));
  }
  async claimInitialization(id: string, staleBefore: Date, claimedAt: Date) {
    const row = (
      await this.sql.query<any>(
        `update funding_capability.funding_transactions f set state='initializing',initialization_claimed_at=$3,updated_at=now() where f.uuid=$1 and (f.state='initialization_pending' or (f.state='initializing' and coalesce(f.initialization_claimed_at,f.updated_at)<=$2)) returning f.*,f.uuid as id, (select uuid from identity_capability.accounts where id=f.account_id) as account_uuid`,
        [id, staleBefore, claimedAt],
      )
    ).rows[0];
    return row ? this.map(row) : null;
  }
  async save(v: FundingTransaction) {
    try {
      await this.sql.query(
        `insert into funding_capability.funding_transactions(uuid,account_id,provider_name,provider_reference,provider_transaction_id,canonical_amount_minor,canonical_currency,collection_amount_minor,collection_currency,conversion_snapshot,state,idempotency_key,provider_initialization,confirmed_at,initialization_claimed_at,next_verification_at)
      values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16) on conflict(uuid) do update set state=excluded.state,provider_transaction_id=case when funding_capability.funding_transactions.provider_transaction_id is null then excluded.provider_transaction_id when excluded.provider_transaction_id is null then funding_capability.funding_transactions.provider_transaction_id else excluded.provider_transaction_id end,provider_initialization=coalesce(excluded.provider_initialization,funding_capability.funding_transactions.provider_initialization),confirmed_at=coalesce(excluded.confirmed_at,funding_capability.funding_transactions.confirmed_at),initialization_claimed_at=excluded.initialization_claimed_at,next_verification_at=excluded.next_verification_at,updated_at=now()`,
        [
          v.id,
          v.accountId,
          v.providerName,
          v.providerReference,
          v.providerTransactionId ?? null,
          v.canonicalAmount.minorAmount.toString(),
          v.canonicalAmount.currency,
          v.collectionAmount.minorAmount.toString(),
          v.collectionAmount.currency,
          v.conversionSnapshot
            ? JSON.stringify({
                ...v.conversionSnapshot,
                observedAt: v.conversionSnapshot.observedAt.toISOString(),
              })
            : null,
          v.state,
          v.idempotencyKey,
          v.providerInitialization ? JSON.stringify(v.providerInitialization) : null,
          v.confirmedAt ?? null,
          v.initializationClaimedAt ?? null,
          v.nextVerificationAt ?? null,
        ],
      );
    } catch (error) {
      if (
        (error as { code?: string; constraint?: string }).code === "23505" &&
        (error as { constraint?: string }).constraint === "funding_provider_transaction_id_unique"
      )
        throw new DuplicateProviderTransactionError();
      throw error;
    }
  }
  private async find(where: string, values: unknown[], o?: { forUpdate?: boolean }) {
    const r = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id, a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id where ${where}${o?.forUpdate ? " for update" : ""}`,
        [...values],
      )
    ).rows[0];
    return r ? this.map(r) : null;
  }
  private map(r: any) {
    const s = r.conversion_snapshot;
    return {
      id: r.id,
      accountId: r.account_uuid ?? r.account_id,
      providerName: r.provider_name,
      providerReference: r.provider_reference,
      providerTransactionId: r.provider_transaction_id ?? null,
      canonicalAmount: Money.of(BigInt(r.canonical_amount_minor), r.canonical_currency),
      collectionAmount: Money.of(BigInt(r.collection_amount_minor), r.collection_currency),
      conversionSnapshot: s ? { ...s, observedAt: new Date(s.observedAt) } : undefined,
      state: r.state,
      idempotencyKey: r.idempotency_key,
      providerInitialization: r.provider_initialization ?? undefined,
      confirmedAt: r.confirmed_at ?? undefined,
      initializationClaimedAt: r.initialization_claimed_at ?? undefined,
      nextVerificationAt: r.next_verification_at ?? undefined,
      createdAt: r.created_at ?? undefined,
    } as FundingTransaction;
  }
}
