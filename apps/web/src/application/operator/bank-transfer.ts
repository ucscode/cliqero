import type { SqlExecutor } from "@/infrastructure/postgres/shared/database";
import type { UnitOfWork } from "@/kernel/unit-of-work";

/** Bank Transfer owns the rules for operator confirmation of its evidence. */
export class BankTransferOperatorConfirmationService {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly uow: UnitOfWork = { transaction: (operation) => operation() },
  ) {}

  async confirm(actorId: string, fundingId: string) {
    return this.uow.transaction(async () => {
      const row = (
        await this.sql.query<{
          id: string;
          provider_name: string;
          provider_reference: string;
          state: string;
          collection_amount_minor: string;
          collection_currency: string;
          confirmed_at: string | null;
        }>(
          `select f.uuid as id,f.provider_name,f.provider_reference,f.state,
                  f.collection_amount_minor,f.collection_currency,f.confirmed_at
             from funding_capability.funding_transactions f
            where f.uuid=$1
            for update`,
          [fundingId],
        )
      ).rows[0];
      if (!row) throw new Error("Funding not found");
      if (row.provider_name !== "bank_transfer") throw new Error("Funding provider mismatch");
      if (row.state === "confirmed")
        return { id: row.id, state: row.state, confirmedAt: row.confirmed_at ?? null };
      if (row.state !== "awaiting_payment" && row.state !== "verification_pending")
        throw new Error("Funding is not awaiting manual confirmation");

      await this.sql.query(
        `update funding_capability.funding_transactions
            set state='confirmed',confirmed_at=now(),updated_at=now()
          where uuid=$1`,
        [fundingId],
      );
      await this.sql.query(
        `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
         values((select id from identity_capability.accounts where uuid=$1),$2,'funding_transaction',$3,$4::jsonb,$5::jsonb,gen_random_uuid())`,
        [
          actorId,
          "funding.bank_transfer.confirmed",
          fundingId,
          JSON.stringify({
            provider: row.provider_name,
            providerReference: row.provider_reference,
            state: row.state,
          }),
          JSON.stringify({
            provider: row.provider_name,
            providerReference: row.provider_reference,
            amountMinor: String(row.collection_amount_minor),
            currency: row.collection_currency,
            state: "confirmed",
          }),
        ],
      );
      return { id: row.id, state: "confirmed", confirmedAt: new Date().toISOString() };
    });
  }
}
