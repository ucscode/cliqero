import type { SqlExecutor } from "@/infrastructure/postgres/database";
import type { UnitOfWork } from "@/kernel/unit-of-work";

export type BankTransferEvidenceInput = {
  transferReference?: string;
  proofImageUrl?: string;
  customerNote?: string;
};

export class BankTransferEvidenceService {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly uow: UnitOfWork = { transaction: (operation) => operation() },
  ) {}

  async submit(accountId: string, fundingId: string, input: BankTransferEvidenceInput) {
    const transferReference = clean(input.transferReference, 200);
    const proofImageUrl = clean(input.proofImageUrl, 2048);
    const customerNote = clean(input.customerNote, 2000);
    if (!transferReference && !proofImageUrl && !customerNote)
      throw new Error("At least one transfer evidence item is required");

    return this.uow.transaction(async () => {
      const funding = (
        await this.sql.query<any>(
          `select f.uuid as id,f.account_id,f.provider_name,f.state
             from funding_capability.funding_transactions f
            where f.uuid=$1
            for update`,
          [fundingId],
        )
      ).rows[0];
      if (!funding || funding.account_id === undefined) throw new Error("Funding not found");
      const owner = (
        await this.sql.query<{ uuid: string }>(
          `select uuid from identity_capability.accounts where id=$1 and uuid=$2`,
          [funding.account_id, accountId],
        )
      ).rows[0];
      if (!owner) throw new Error("Funding not found");
      if (funding.provider_name !== "bank_transfer") throw new Error("Funding provider mismatch");

      const existing = (
        await this.sql.query<any>(
          `select uuid as id,transfer_reference,proof_image_url,customer_note,created_at
             from funding_capability.funding_evidence
            where funding_id=(select id from funding_capability.funding_transactions where uuid=$1)`,
          [fundingId],
        )
      ).rows[0];
      if (existing)
        return {
          id: existing.id,
          fundingId,
          transferReference: existing.transfer_reference ?? null,
          proofImageUrl: existing.proof_image_url ?? null,
          customerNote: existing.customer_note ?? null,
          createdAt: new Date(existing.created_at).toISOString(),
          state: "verification_pending" as const,
        };
      if (funding.state !== "awaiting_payment" && funding.state !== "verification_pending")
        throw new Error("Funding is not available for evidence");

      const inserted = (
        await this.sql.query<any>(
          `insert into funding_capability.funding_evidence(uuid,funding_id,account_id,transfer_reference,proof_image_url,customer_note)
           values(gen_random_uuid(),(select id from funding_capability.funding_transactions where uuid=$1),$2,$3,$4,$5)
           returning uuid as id,created_at`,
          [fundingId, funding.account_id, transferReference, proofImageUrl, customerNote],
        )
      ).rows[0];
      await this.sql.query(
        `update funding_capability.funding_transactions set state='verification_pending',updated_at=now() where uuid=$1`,
        [fundingId],
      );
      await this.sql.query(
        `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
         values((select id from identity_capability.accounts where uuid=$1),'funding.bank_transfer.evidence_submitted','funding_transaction',$2,$3::jsonb,$4::jsonb,gen_random_uuid())`,
        [
          accountId,
          fundingId,
          JSON.stringify({ state: funding.state }),
          JSON.stringify({ state: "verification_pending", evidenceId: inserted.id }),
        ],
      );
      return {
        id: inserted.id,
        fundingId,
        transferReference: transferReference ?? null,
        proofImageUrl: proofImageUrl ?? null,
        customerNote: customerNote ?? null,
        createdAt: new Date(inserted.created_at).toISOString(),
        state: "verification_pending" as const,
      };
    });
  }
}

function clean(value: string | undefined, max: number) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) throw new Error("Evidence field is too long");
  return normalized;
}
