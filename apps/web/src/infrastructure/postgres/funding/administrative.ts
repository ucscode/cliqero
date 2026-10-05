import { newId } from "@/kernel/ids";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { AdministrativeFundingRepository } from "@/application/operator/funding";

export class PostgresAdministrativeFundingRepository implements AdministrativeFundingRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async lockIdempotencyKey(idempotencyKey: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `admin-funding-idempotency:${idempotencyKey}`,
    ]);
  }

  async lockAccount(accountId: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `wallet-transfer:${accountId}`,
    ]);
  }

  async create(input: Parameters<AdministrativeFundingRepository["create"]>[0]) {
    await this.sql.query(
      `insert into funding_capability.administrative_fundings
        (uuid,account_id,amount_minor,state,reason,reference,idempotency_key,created_by)
       values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,
         (select id from identity_capability.accounts where uuid=$8))`,
      [
        input.id,
        input.accountId,
        input.amountMinor.toString(),
        input.state,
        input.reason,
        input.reference,
        input.idempotencyKey,
        input.actorId,
      ],
    );
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const row = (
      await this.sql.query<any>(
        `select f.uuid id,a.uuid account_id,f.amount_minor,f.state,f.reason,f.reference,
              actor.uuid created_by
         from funding_capability.administrative_fundings f
         join identity_capability.accounts a on a.id=f.account_id
         left join identity_capability.accounts actor on actor.id=f.created_by
        where f.idempotency_key=$1`,
        [idempotencyKey],
      )
    ).rows[0];
    return row
      ? {
          id: row.id,
          accountId: row.account_id,
          amountMinor: BigInt(row.amount_minor),
          state: row.state,
          reason: row.reason,
          reference: row.reference,
          createdBy: row.created_by,
        }
      : null;
  }

  async findForUpdate(id: string) {
    const row = (
      await this.sql.query<{
        id: string;
        account_id: string;
        amount_minor: string;
        state: "confirmed" | "failed" | "blocked" | "cancelled";
        reason: string;
        reference: string | null;
      }>(
        `select f.uuid id,a.uuid account_id,f.amount_minor,f.state,f.reason,f.reference
           from funding_capability.administrative_fundings f
           join identity_capability.accounts a on a.id=f.account_id
          where f.uuid=$1 for update of f`,
        [id],
      )
    ).rows[0];
    return row
      ? { ...row, amountMinor: BigInt(row.amount_minor), accountId: row.account_id }
      : null;
  }

  async update(input: Parameters<AdministrativeFundingRepository["update"]>[0]) {
    const result = await this.sql.query(
      `update funding_capability.administrative_fundings
          set amount_minor=$2,state=$3,reason=$4,reference=$5,updated_at=now()
        where uuid=$1`,
      [input.id, input.amountMinor.toString(), input.state, input.reason, input.reference],
    );
    if (result.rowCount !== 1) throw new Error("Administrative funding not found");
  }

  async delete(id: string) {
    const result = await this.sql.query(
      `delete from funding_capability.administrative_fundings where uuid=$1`,
      [id],
    );
    if (result.rowCount !== 1) throw new Error("Administrative funding not found");
  }

  async recordMovement(input: Parameters<AdministrativeFundingRepository["recordMovement"]>[0]) {
    const id = newId();
    await this.sql.query(
      `insert into wallet_capability.funding_adjustments
        (uuid,funding_id,account_id,amount_minor,reason,reference,idempotency_key,actor_id)
       values($1,$2,(select id from identity_capability.accounts where uuid=$3),$4,$5,$6,$7,
         (select id from identity_capability.accounts where uuid=$8))`,
      [
        id,
        input.fundingId,
        input.accountId,
        input.amountMinor.toString(),
        input.reason,
        input.reference,
        `admin-funding:${id}`,
        input.actorId,
      ],
    );
    return id;
  }
}
