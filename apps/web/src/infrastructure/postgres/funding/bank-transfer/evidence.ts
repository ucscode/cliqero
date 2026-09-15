import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  BankTransferEvidence,
  BankTransferEvidenceRepository,
} from "@/application/funding/bank-transfer/evidence";

type EvidenceRow = {
  id: string;
  transfer_reference: string | null;
  proof_image_url: string | null;
  customer_note: string | null;
  proof_storage_provider: string | null;
  proof_storage_container: string | null;
  proof_object_key: string | null;
  proof_original_filename: string | null;
  proof_mime_type: string | null;
  proof_byte_size: string | number | bigint | null;
  created_at: string | Date;
};

export class PostgresBankTransferEvidenceRepository implements BankTransferEvidenceRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async findForFunding(accountId: string, fundingId: string): Promise<BankTransferEvidence | null> {
    const row = (
      await this.sql.query<EvidenceRow>(
        `select e.uuid as id,e.transfer_reference,e.proof_image_url,e.customer_note,
                e.proof_storage_provider,e.proof_storage_container,e.proof_object_key,
                e.proof_original_filename,e.proof_mime_type,e.proof_byte_size,e.created_at
           from funding_capability.funding_evidence e
           join funding_capability.funding_transactions f on f.id=e.funding_id
           join identity_capability.accounts a on a.id=f.account_id
          where f.uuid=$1 and a.uuid=$2`,
        [fundingId, accountId],
      )
    ).rows[0];
    return row ? mapEvidence(row, fundingId) : null;
  }

  async save(input: {
    accountId: string;
    fundingId: string;
    transferReference: string | null;
    customerNote: string | null;
    proof: BankTransferEvidence["proof"];
  }): Promise<BankTransferEvidence> {
    const row = (
      await this.sql.query<{ id: string; created_at: string | Date }>(
        `insert into funding_capability.funding_evidence(
           uuid,funding_id,account_id,transfer_reference,customer_note,
           proof_storage_provider,proof_storage_container,proof_object_key,
           proof_original_filename,proof_mime_type,proof_byte_size
         ) values(
           gen_random_uuid(),
           (select id from funding_capability.funding_transactions where uuid=$1),
           (select id from identity_capability.accounts where uuid=$2),
           $3,$4,$5,$6,$7,$8,$9,$10
         ) returning uuid as id,created_at`,
        [
          input.fundingId,
          input.accountId,
          input.transferReference,
          input.customerNote,
          input.proof?.provider ?? null,
          input.proof?.container ?? null,
          input.proof?.key ?? null,
          input.proof?.originalFilename ?? null,
          input.proof?.mimeType ?? null,
          input.proof?.byteSize ?? null,
        ],
      )
    ).rows[0];
    return {
      id: row.id,
      fundingId: input.fundingId,
      transferReference: input.transferReference,
      proofImageUrl: null,
      customerNote: input.customerNote,
      proof: input.proof,
      createdAt: new Date(row.created_at).toISOString(),
      state: "verification_pending",
    };
  }
}

function mapEvidence(row: EvidenceRow, fundingId: string): BankTransferEvidence {
  return {
    id: row.id,
    fundingId,
    transferReference: row.transfer_reference ?? null,
    proofImageUrl: row.proof_image_url ?? null,
    customerNote: row.customer_note ?? null,
    proof:
      row.proof_storage_provider &&
      row.proof_storage_container &&
      row.proof_object_key &&
      row.proof_mime_type &&
      row.proof_byte_size !== null
        ? {
            provider: row.proof_storage_provider,
            container: row.proof_storage_container,
            key: row.proof_object_key,
            originalFilename: row.proof_original_filename ?? null,
            mimeType: row.proof_mime_type,
            byteSize: String(row.proof_byte_size),
          }
        : null,
    createdAt: new Date(row.created_at).toISOString(),
    state: "verification_pending",
  };
}
