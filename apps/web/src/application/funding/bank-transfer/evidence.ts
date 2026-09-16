import { randomUUID } from "node:crypto";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AuditRecorder } from "@/application/shared/audit";
import type { FundingRepository } from "@/modules/funding/funding";
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

export interface BankTransferEvidenceRepository {
  findForFunding(accountId: string, fundingId: string): Promise<BankTransferEvidence | null>;
  save(input: {
    accountId: string;
    fundingId: string;
    transferReference: string | null;
    customerNote: string | null;
    proof: BankTransferEvidence["proof"];
  }): Promise<BankTransferEvidence>;
}

export class BankTransferEvidenceService {
  constructor(
    private readonly funding: FundingRepository,
    private readonly evidence: BankTransferEvidenceRepository,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
    private readonly storage?: ObjectStorageRegistry,
    private readonly storageInstanceName?: string,
  ) {}

  findForFunding(accountId: string, fundingId: string) {
    return this.evidence.findForFunding(accountId, fundingId);
  }

  async submit(accountId: string, fundingId: string, input: BankTransferEvidenceInput) {
    const transferReference = clean(input.transferReference, 200);
    const customerNote = clean(input.customerNote, 2000);
    const proofFile = input.proofFile ? validateProofFile(input.proofFile) : undefined;
    if (!transferReference && !proofFile && !customerNote)
      throw new Error("At least one transfer evidence item is required");

    let stored: StoredObject | undefined;
    try {
      return await this.uow.transaction(async () => {
        const current = await this.funding.findById(fundingId, { forUpdate: true });
        if (!current || current.accountId !== accountId) throw new Error("Funding not found");
        if (current.providerName !== "bank_transfer") throw new Error("Funding provider mismatch");
        const existing = await this.evidence.findForFunding(accountId, fundingId);
        if (existing) return existing;
        if (
          current.state !== "initialization_pending" &&
          current.state !== "initializing" &&
          current.state !== "awaiting_payment" &&
          current.state !== "verification_pending"
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

        const proof = stored
          ? {
              provider: stored.provider,
              container: stored.container,
              key: stored.key,
              originalFilename: proofFile ? safeFilename(proofFile.filename) : null,
              mimeType: stored.mimeType,
              byteSize: String(stored.byteSize),
            }
          : null;
        const saved = await this.evidence.save({
          accountId,
          fundingId,
          transferReference: transferReference ?? null,
          customerNote: customerNote ?? null,
          proof,
        });
        await this.funding.save({
          ...current,
          providerTransactionId: current.providerTransactionId ?? null,
          state: "verification_pending",
        });
        await this.audit.record({
          actorId: accountId,
          action: "funding.bank_transfer.evidence_submitted",
          subjectType: "funding_transaction",
          subjectId: fundingId,
          previousState: { state: current.state },
          newState: { state: "verification_pending", evidenceId: saved.id },
        });
        return saved;
      });
    } catch (error) {
      if (stored && this.storage) {
        try {
          await this.storage.get(stored.provider).delete(stored);
        } catch {
          // Persistence did not commit; storage cleanup can be retried separately.
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

function clean(value: string | undefined, max: number) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) throw new Error("Evidence field is too long");
  return normalized;
}
