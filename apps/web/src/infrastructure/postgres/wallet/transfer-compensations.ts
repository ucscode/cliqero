import { Buffer } from "node:buffer";
import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  WalletTransferCompensation,
  WalletTransferCompensationRepository,
} from "@/modules/wallet/transfer-compensations";
import type { WalletName } from "@/modules/wallet/wallet";

type Row = {
  id: string;
  transfer_id: string;
  account_id: string;
  from_wallet: WalletName;
  to_wallet: WalletName;
  gross_minor: string;
  fee_minor: string;
  net_minor: string;
  reason: string;
  destination_wallet_minor: string;
  source_wallet_minor: string;
  fee_refunded_minor: string;
  debt_minor: string;
  created_by: string;
  correlation_id: string;
  idempotency_key: string;
  created_at: Date | string;
  cursor_at?: string;
};

export class PostgresWalletTransferCompensationRepository implements WalletTransferCompensationRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async lockAccount(accountId: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `wallet-transfer:${accountId}`,
    ]);
  }

  async lockIdempotencyKey(key: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `wallet-transfer-compensation:${key}`,
    ]);
  }

  async findTransfer(id: string) {
    const row = (
      await this.sql.query<{
        id: string;
        account_id: string;
        from_wallet: WalletName;
        to_wallet: WalletName;
        gross_minor: string;
        fee_minor: string;
        net_minor: string;
      }>(
        `select transfer.uuid id,account.uuid account_id,transfer.from_wallet,transfer.to_wallet,
                transfer.gross_minor::text,transfer.fee_minor::text,transfer.net_minor::text
           from wallet_capability.transfers transfer
           join identity_capability.accounts account on account.id=transfer.account_id
          where transfer.uuid=$1`,
        [id],
      )
    ).rows[0];
    return row
      ? {
          id: row.id,
          accountId: row.account_id,
          fromWallet: row.from_wallet,
          toWallet: row.to_wallet,
          grossMinor: BigInt(row.gross_minor),
          feeMinor: BigInt(row.fee_minor),
          netMinor: BigInt(row.net_minor),
        }
      : null;
  }

  async lockTransfer(id: string) {
    const result = await this.sql.query(
      `select id from wallet_capability.transfers where uuid=$1 for update`,
      [id],
    );
    if (!result.rowCount)
      throw new PublicApplicationError("Wallet transfer not found.", "not_found", 404);
  }

  async findByIdempotencyKey(key: string) {
    const row = (
      await this.sql.query<Row>(`${projection} where compensation.idempotency_key=$1`, [key])
    ).rows[0];
    return row ? project(row) : null;
  }

  async findByTransferId(transferId: string) {
    const row = (await this.sql.query<Row>(`${projection} where transfer.uuid=$1`, [transferId]))
      .rows[0];
    return row ? project(row) : null;
  }

  async findById(id: string) {
    const row = (await this.sql.query<Row>(`${projection} where compensation.uuid=$1`, [id]))
      .rows[0];
    return row ? project(row) : null;
  }

  async list(input: { accountId?: string; transferId?: string; cursor?: string; limit: number }) {
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const rows = (
      await this.sql.query<Row>(
        `${projection}
         where ($1::uuid is null or account.uuid=$1)
           and ($2::uuid is null or transfer.uuid=$2)
           and ($3::timestamptz is null or (compensation.created_at,compensation.uuid)<($3,$4::uuid))
         order by compensation.created_at desc,compensation.uuid desc limit $5`,
        [
          input.accountId ?? null,
          input.transferId ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          input.limit + 1,
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

  async lockTreasuryBalance() {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      "treasury-balance",
    ]);
  }

  async treasuryBalance() {
    const row = (
      await this.sql.query<{ balance: string }>(
        `select coalesce(sum(case when direction='credit' then amount_minor else -amount_minor end),0)::text balance
           from treasury_capability.entries`,
      )
    ).rows[0];
    return BigInt(row?.balance ?? "0");
  }

  async create(value: WalletTransferCompensation) {
    const result = await this.sql.query<Row>(
      `insert into wallet_capability.transfer_compensations
        (uuid,transfer_id,account_id,from_wallet,to_wallet,gross_minor,fee_minor,net_minor,reason,
         destination_wallet_minor,source_wallet_minor,fee_refunded_minor,debt_minor,created_by,
         correlation_id,idempotency_key,created_at)
       values($1,(select id from wallet_capability.transfers where uuid=$2),
         (select id from identity_capability.accounts where uuid=$3),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         (select id from identity_capability.accounts where uuid=$14),$15,$16,$17)
       returning uuid id,(select uuid from wallet_capability.transfers where id=transfer_id) transfer_id,
         (select uuid from identity_capability.accounts where id=account_id) account_id,from_wallet,to_wallet,
         gross_minor::text,fee_minor::text,net_minor::text,reason,destination_wallet_minor::text,
         source_wallet_minor::text,fee_refunded_minor::text,debt_minor::text,
         (select uuid from identity_capability.accounts where id=created_by) created_by,
         correlation_id,idempotency_key,created_at`,
      [
        value.id,
        value.transferId,
        value.accountId,
        value.fromWallet,
        value.toWallet,
        value.grossMinor.toString(),
        value.feeMinor.toString(),
        value.netMinor.toString(),
        value.reason,
        value.recovery.destinationWalletMinor.toString(),
        value.recovery.sourceWalletMinor.toString(),
        value.recovery.feeRefundedMinor.toString(),
        value.recovery.debtMinor.toString(),
        value.createdBy,
        value.correlationId,
        value.idempotencyKey,
        value.createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Wallet transfer compensation was not persisted.");

    if (value.feeMinor > 0n) {
      await this.sql.query(
        `insert into treasury_capability.entries
          (uuid,direction,amount_minor,title,note,source_kind,source_id,idempotency_key,actor_id,correlation_id,created_at)
         values($1,'debit',$2,'Wallet transfer fee refund',$3,'wallet_transfer_compensation',$4,$5,
           (select id from identity_capability.accounts where uuid=$6),$7,$8)`,
        [
          newId(),
          value.feeMinor.toString(),
          `Compensation ${value.id} for transfer ${value.transferId}`,
          value.id,
          `wallet-transfer-compensation:${value.id}:treasury-fee-refund`,
          value.createdBy,
          value.correlationId,
          value.createdAt,
        ],
      );
    }
    return project(row);
  }
}

const projection = `select compensation.uuid id,transfer.uuid transfer_id,account.uuid account_id,
  compensation.from_wallet,compensation.to_wallet,compensation.gross_minor::text gross_minor,
  compensation.fee_minor::text fee_minor,compensation.net_minor::text net_minor,compensation.reason,
  compensation.destination_wallet_minor::text destination_wallet_minor,
  compensation.source_wallet_minor::text source_wallet_minor,
  compensation.fee_refunded_minor::text fee_refunded_minor,compensation.debt_minor::text debt_minor,
  actor.uuid created_by,compensation.correlation_id,compensation.idempotency_key,compensation.created_at,
  to_char(compensation.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at
 from wallet_capability.transfer_compensations compensation
 join wallet_capability.transfers transfer on transfer.id=compensation.transfer_id
 join identity_capability.accounts account on account.id=compensation.account_id
 join identity_capability.accounts actor on actor.id=compensation.created_by`;

function project(row: Row): WalletTransferCompensation {
  return {
    id: row.id,
    transferId: row.transfer_id,
    accountId: row.account_id,
    fromWallet: row.from_wallet,
    toWallet: row.to_wallet,
    grossMinor: BigInt(row.gross_minor),
    feeMinor: BigInt(row.fee_minor),
    netMinor: BigInt(row.net_minor),
    reason: row.reason,
    recovery: {
      destinationWalletMinor: BigInt(row.destination_wallet_minor),
      sourceWalletMinor: BigInt(row.source_wallet_minor),
      feeRefundedMinor: BigInt(row.fee_refunded_minor),
      debtMinor: BigInt(row.debt_minor),
    },
    createdBy: row.created_by,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at),
  };
}

function decodeCursor(value: string) {
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      Object.keys(decoded).sort().join(",") !== "createdAt,id" ||
      typeof decoded.createdAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(decoded.createdAt) ||
      !Number.isFinite(Date.parse(decoded.createdAt)) ||
      typeof decoded.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.id)
    )
      throw new Error();
    return { createdAt: decoded.createdAt as string, id: decoded.id as string };
  } catch {
    throw new PublicApplicationError(
      "Invalid wallet transfer compensation cursor.",
      "invalid_cursor",
      400,
    );
  }
}
