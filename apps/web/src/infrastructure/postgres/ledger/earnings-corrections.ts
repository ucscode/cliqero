import { Buffer } from "node:buffer";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  CorrectableEarningSource,
  EarningsCorrection,
  EarningsCorrectionRepository,
} from "@/modules/ledger/earnings-corrections";

type CorrectionRow = {
  id: string;
  account_id: string;
  account_username: string;
  source_entry_id: string;
  purchase_id: string;
  distribution_id: string;
  amount_minor: string;
  pending_minor: string;
  available_minor: string;
  debt_minor: string;
  reason: string;
  created_by: string;
  created_by_username: string;
  correlation_id: string;
  idempotency_key: string;
  created_at: Date | string;
  cursor_id?: string;
};

type SourceRow = {
  id: string;
  account_id: string;
  purchase_id: string;
  distribution_id: string;
  amount_minor: string;
  balance_state: "pending" | "available";
  maturity_at: Date | null;
  recipient_role: "seller" | "referral";
  referral_level: number | null;
  settled: boolean;
  reversed: boolean;
  corrected_minor: string;
  reversed_minor: string;
};

export class PostgresEarningsCorrectionRepository implements EarningsCorrectionRepository {
  constructor(private readonly sql: QueryExecutor) {}

  findSource(id: string) {
    return this.readSource(id, false);
  }

  async lockPurchase(purchaseId: string) {
    const result = await this.sql.query(
      `select id from purchase_capability.purchases where uuid=$1 for update`,
      [purchaseId],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async lockAccount(accountId: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `wallet-transfer:${accountId}`,
    ]);
  }

  async lockIdempotencyKey(key: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `earnings-correction:${key}`,
    ]);
  }

  lockSource(id: string) {
    return this.readSource(id, true);
  }

  async findByIdempotencyKey(key: string) {
    const row = (
      await this.sql.query<CorrectionRow>(`${projection} where correction.idempotency_key=$1`, [
        key,
      ])
    ).rows[0];
    return row ? map(row) : null;
  }

  async availableEarnings(accountId: string) {
    const row = (
      await this.sql.query<{ amount: string }>(
        `select ledger_capability.available_earnings_minor(account.id,'USD')::text amount
           from identity_capability.accounts account where account.uuid=$1`,
        [accountId],
      )
    ).rows[0];
    return BigInt(row?.amount ?? "0");
  }

  async create(input: Parameters<EarningsCorrectionRepository["create"]>[0]) {
    const row = (
      await this.sql.query<CorrectionRow>(
        `insert into ledger_capability.earnings_corrections
          (uuid,account_id,source_entry_id,amount_minor,pending_minor,available_minor,debt_minor,
           reason,created_by,correlation_id,idempotency_key)
         values($1,(select id from identity_capability.accounts where uuid=$2),
           (select id from ledger_capability.entries where uuid=$3),$4,$5,$6,$7,$8,
           (select id from identity_capability.accounts where uuid=$9),$10,$11)
         returning uuid id,(select uuid from identity_capability.accounts where id=account_id) account_id,
           (select username from identity_capability.accounts where id=account_id) account_username,
           (select uuid from ledger_capability.entries where id=source_entry_id) source_entry_id,
           (select uuid from purchase_capability.purchases where id=(select purchase_id from ledger_capability.entries where id=source_entry_id)) purchase_id,
           (select uuid from ledger_capability.purchase_distributions where id=(select distribution_id from ledger_capability.entries where id=source_entry_id)) distribution_id,
           amount_minor,pending_minor,available_minor,debt_minor,reason,
           (select uuid from identity_capability.accounts where id=created_by) created_by,
           (select username from identity_capability.accounts where id=created_by) created_by_username,
           correlation_id,idempotency_key,created_at`,
        [
          input.id,
          input.accountId,
          input.sourceEntryId,
          input.amountMinor.toString(),
          input.pendingMinor.toString(),
          input.availableMinor.toString(),
          input.debtMinor.toString(),
          input.reason,
          input.actorId,
          input.correlationId,
          input.idempotencyKey,
        ],
      )
    ).rows[0];
    if (!row) throw new Error("Earnings correction was not persisted");
    return map(row);
  }

  async appendDebit(input: Parameters<EarningsCorrectionRepository["appendDebit"]>[0]) {
    await this.sql.query(
      `insert into ledger_capability.entries
        (uuid,distribution_id,account_id,purchase_id,entry_type,direction,amount_minor,currency,
         idempotency_key,correlation_id,recipient_role,basis,referral_level,balance_state,maturity_at,
         original_entry_id,reversal_id)
       values($1,(select id from ledger_capability.purchase_distributions where uuid=$2),
         (select id from identity_capability.accounts where uuid=$3),
         (select id from purchase_capability.purchases where uuid=$4),
         'purchase-reversal','debit',$5,'USD',$6,$7,$8,'earnings-correction',
         $9,$10,$11,(select id from ledger_capability.entries where uuid=$12),null)`,
      [
        input.id,
        input.source.distributionId,
        input.source.accountId,
        input.source.purchaseId,
        input.amountMinor.toString(),
        `earnings-correction:${input.correctionId}:${input.suffix}`,
        input.correlationId,
        // The source's role/level is copied by the source query's caller below;
        // corrections are recorded against the same beneficiary allocation.
        input.source.recipientRole,
        input.source.referralLevel,
        input.balanceState,
        input.maturityAt,
        input.source.id,
      ],
    );
  }

  async list(input: Parameters<EarningsCorrectionRepository["list"]>[0]) {
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const rows = (
      await this.sql.query<CorrectionRow>(
        `${projection}
         where ($1::uuid is null or source.uuid=$1)
           and ($2::timestamptz is null or (correction.created_at,correction.id)<($2,$3::bigint))
         order by correction.created_at desc,correction.id desc limit $4`,
        [
          input.sourceEntryId ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          input.limit + 1,
        ],
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(map),
      nextCursor:
        rows.length > input.limit && last
          ? Buffer.from(
              JSON.stringify({ createdAt: String(last.created_at), id: last.cursor_id }),
            ).toString("base64url")
          : null,
    };
  }

  async get(id: string) {
    const row = (
      await this.sql.query<CorrectionRow>(`${projection} where correction.uuid=$1`, [id])
    ).rows[0];
    return row ? map(row) : null;
  }

  private async readSource(
    id: string,
    forUpdate: boolean,
  ): Promise<CorrectableEarningSource | null> {
    const row = (
      await this.sql.query<SourceRow>(
        `select source.uuid id,account.uuid account_id,purchase.uuid purchase_id,
                distribution.uuid distribution_id,source.amount_minor::text amount_minor,
                source.balance_state,source.maturity_at,source.recipient_role,source.referral_level,
                (source.balance_state='available' or settlement.id is not null) settled,
                exists(select 1 from ledger_capability.reversals reversal
                        where reversal.purchase_id=source.purchase_id and reversal.state='processed') reversed,
                coalesce((select sum(correction.amount_minor) from ledger_capability.earnings_corrections correction
                           where correction.source_entry_id=source.id),0)::text corrected_minor,
                coalesce((select sum(reversal_entry.amount_minor) from ledger_capability.entries reversal_entry
                           where reversal_entry.original_entry_id=source.id and reversal_entry.reversal_id is not null),0)::text reversed_minor
           from ledger_capability.entries source
           join identity_capability.accounts account on account.id=source.account_id
           join purchase_capability.purchases purchase on purchase.id=source.purchase_id
           join ledger_capability.purchase_distributions distribution on distribution.id=source.distribution_id
           left join ledger_capability.entry_settlements settlement on settlement.original_entry_id=source.id
          where source.uuid=$1 and source.entry_type='purchase-earnings' and source.direction='credit'
            and source.recipient_role in ('seller','referral') and source.currency='USD'
            and source.original_entry_id is null and source.reversal_id is null
          ${forUpdate ? "for update of source" : ""}`,
        [id],
      )
    ).rows[0];
    if (!row) return null;
    const remainingMinor =
      BigInt(row.amount_minor) - BigInt(row.corrected_minor) - BigInt(row.reversed_minor);
    return {
      id: row.id,
      accountId: row.account_id,
      purchaseId: row.purchase_id,
      distributionId: row.distribution_id,
      amountMinor: BigInt(row.amount_minor),
      remainingMinor: remainingMinor > 0n ? remainingMinor : 0n,
      balanceState: row.balance_state,
      maturityAt: row.maturity_at,
      recipientRole: row.recipient_role,
      referralLevel: row.referral_level,
      settled: row.settled,
      reversed: row.reversed,
    };
  }
}

const projection = `select correction.uuid id,account.uuid account_id,account.username account_username,
       source.uuid source_entry_id,purchase.uuid purchase_id,distribution.uuid distribution_id,
       correction.amount_minor,correction.pending_minor,correction.available_minor,correction.debt_minor,
       correction.reason,actor.uuid created_by,correction.correlation_id,correction.idempotency_key,
       actor.username created_by_username,
       correction.created_at,correction.id::text cursor_id
  from ledger_capability.earnings_corrections correction
  join identity_capability.accounts account on account.id=correction.account_id
  join ledger_capability.entries source on source.id=correction.source_entry_id
  join purchase_capability.purchases purchase on purchase.id=source.purchase_id
  join ledger_capability.purchase_distributions distribution on distribution.id=source.distribution_id
  join identity_capability.accounts actor on actor.id=correction.created_by`;

function map(row: CorrectionRow): EarningsCorrection {
  return {
    id: row.id,
    accountId: row.account_id,
    accountUsername: row.account_username,
    sourceEntryId: row.source_entry_id,
    purchaseId: row.purchase_id,
    distributionId: row.distribution_id,
    amountMinor: String(row.amount_minor),
    pendingMinor: String(row.pending_minor),
    availableMinor: String(row.available_minor),
    debtMinor: String(row.debt_minor),
    reason: row.reason,
    createdBy: row.created_by,
    createdByUsername: row.created_by_username,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function decodeCursor(value: string) {
  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof payload.createdAt !== "string" ||
      !Number.isFinite(Date.parse(payload.createdAt)) ||
      typeof payload.id !== "string" ||
      !/^\d+$/.test(payload.id)
    )
      throw new Error("invalid cursor");
    return { createdAt: payload.createdAt, id: payload.id };
  } catch {
    throw new Error("Invalid earnings correction cursor");
  }
}
