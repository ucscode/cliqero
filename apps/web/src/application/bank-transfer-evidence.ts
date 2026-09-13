import { randomUUID } from "node:crypto";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { ObjectStorageRegistry, StoredObject } from "@/modules/storage/object-storage";

export const BANK_TRANSFER_PROOF_MAX_BYTES = 10 * 1024 * 1024;
const proofMimeTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export type BankTransferProofFile = {
  bytes: Uint8Array;
  mimeType: string;
  filename?: string;
};

export type BankTransferEvidence = {
  id: string;
  fundingId: string;
  transferReference: string | null;
  customerNote: string | null;
  proofImageUrl: string | null;
  proof: {
    provider: string;
    container: string;
    key: string;
    originalFilename: string | null;
    mimeType: string;
    byteSize: string;
  } | null;
  createdAt: string;
  state: "verification_pending";
};

export type BankTransferEvidenceInput = {
  transferReference?: string;
  customerNote?: string;
  proofFile?: BankTransferProofFile;
};

export class BankTransferEvidenceService {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly uow: UnitOfWork = { transaction: (operation) => operation() },
    private readonly storage?: ObjectStorageRegistry,
    private readonly storageInstanceName?: string,
  ) {}

  async findForFunding(accountId: string, fundingId: string): Promise<BankTransferEvidence | null> {
    const row = (
      await this.sql.query<any>(
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

  async submit(accountId: string, fundingId: string, input: BankTransferEvidenceInput) {
    const transferReference = clean(input.transferReference, 200);
    const customerNote = clean(input.customerNote, 2000);
    const proofFile = input.proofFile ? validateProofFile(input.proofFile) : undefined;
    if (!transferReference && !proofFile && !customerNote)
      throw new Error("At least one transfer evidence item is required");

    let stored: StoredObject | undefined;
    try {
      const result = await this.uow.transaction(async () => {
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
            `select uuid as id,transfer_reference,proof_image_url,customer_note,
                    proof_storage_provider,proof_storage_container,proof_object_key,
                    proof_original_filename,proof_mime_type,proof_byte_size,created_at
               from funding_capability.funding_evidence
              where funding_id=(select id from funding_capability.funding_transactions where uuid=$1)`,
            [fundingId],
          )
        ).rows[0];
        if (existing) return mapEvidence(existing, fundingId);
        if (
          funding.state !== "initialization_pending" &&
          funding.state !== "initializing" &&
          funding.state !== "awaiting_payment" &&
          funding.state !== "verification_pending"
        )
          throw new Error("Funding is not available for evidence");

        if (proofFile) {
          if (!this.storage || !this.storageInstanceName)
            throw new Error("Evidence storage instance is unavailable");
          const provider = this.storage.get(this.storageInstanceName);
          if (provider.visibility !== "private")
            throw new Error("Bank-transfer evidence storage must be private");
          stored = await provider.put({
            key: `funding-evidence/${fundingId}/${randomUUID()}${proofExtension(proofFile.mimeType)}`,
            bytes: proofFile.bytes,
            mimeType: proofFile.mimeType,
          });
        }
        const inserted = (
          await this.sql.query<any>(
            `insert into funding_capability.funding_evidence(
               uuid,funding_id,account_id,transfer_reference,customer_note,
               proof_storage_provider,proof_storage_container,proof_object_key,
               proof_original_filename,proof_mime_type,proof_byte_size
             ) values(
               gen_random_uuid(),(select id from funding_capability.funding_transactions where uuid=$1),$2,$3,$4,
               $5,$6,$7,$8,$9,$10
             ) returning uuid as id,created_at`,
            [
              fundingId,
              funding.account_id,
              transferReference,
              customerNote,
              stored?.provider ?? null,
              stored?.container ?? null,
              stored?.key ?? null,
              proofFile ? safeFilename(proofFile.filename) : null,
              stored?.mimeType ?? null,
              stored?.byteSize ?? null,
            ],
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
          proofImageUrl: null,
          customerNote: customerNote ?? null,
          proof: stored
            ? {
                provider: stored.provider,
                container: stored.container,
                key: stored.key,
                originalFilename: proofFile ? safeFilename(proofFile.filename) : null,
                mimeType: stored.mimeType,
                byteSize: String(stored.byteSize),
              }
            : null,
          createdAt: new Date(inserted.created_at).toISOString(),
          state: "verification_pending" as const,
        };
      });
      return result;
    } catch (error) {
      if (stored && this.storage) {
        try {
          await this.storage.get(stored.provider).delete(stored);
        } catch {
          // The evidence row was not committed; leave cleanup to storage operations.
        }
      }
      throw error;
    }
  }
}

export function validateProofFile(file: BankTransferProofFile) {
  if (!proofMimeTypes.has(file.mimeType)) throw new Error("Unsupported evidence file type");
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > BANK_TRANSFER_PROOF_MAX_BYTES)
    throw new Error("Evidence file must be between 1 byte and 10 MB");
  if (!matchesFileSignature(file.bytes, file.mimeType))
    throw new Error("Evidence file content does not match its declared type");
  return file;
}

function matchesFileSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") return ascii(bytes, 0, 5) === "%PDF-";
  if (mimeType === "image/png")
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v);
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/gif")
    return ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a";
  return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function proofExtension(mimeType: string) {
  return mimeType === "application/pdf"
    ? ".pdf"
    : mimeType === "image/jpeg"
      ? ".jpg"
      : `.${mimeType.slice("image/".length)}`;
}

function safeFilename(value?: string) {
  const filename = value
    ?.trim()
    .replace(/[\\/\r\n\0]/g, "_")
    .slice(0, 255);
  return filename || null;
}

function mapEvidence(row: any, fundingId: string): BankTransferEvidence {
  return {
    id: row.id,
    fundingId,
    transferReference: row.transfer_reference ?? null,
    proofImageUrl: row.proof_image_url ?? null,
    customerNote: row.customer_note ?? null,
    proof:
      row.proof_storage_provider && row.proof_storage_container && row.proof_object_key
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

function clean(value: string | undefined, max: number) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) throw new Error("Evidence field is too long");
  return normalized;
}
