import { describe, expect, it, vi } from "vitest";
import {
  BankTransferEvidenceService,
  validateProofFile,
  type BankTransferEvidence,
  type BankTransferEvidenceRepository,
} from "@/application/funding/bank-transfer/evidence";
import type { AuditRecordInput, AuditRecorder } from "@/application/shared/audit";
import type { FundingRepository, FundingTransaction } from "@/modules/funding/funding";
import { Money } from "@/modules/money/money";
import type { ObjectStorageRegistry } from "@/modules/storage/object-storage";

const fundingId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";

function fundingTransaction(
  state: FundingTransaction["state"] = "awaiting_payment",
): FundingTransaction {
  return {
    id: fundingId,
    accountId,
    providerName: "bank_transfer",
    providerReference: "bank-ref",
    providerTransactionId: null,
    canonicalAmount: Money.of(1000n, "USD"),
    collectionAmount: Money.of(1000n, "USD"),
    state,
    idempotencyKey: "funding-key",
  };
}

function makeService(current = fundingTransaction(), storage?: ObjectStorageRegistry, storageName?: string) {
  let existing: BankTransferEvidence | null = null;
  let duplicate: FundingTransaction | null = null;
  const fundingSaves: FundingTransaction[] = [];
  const audits: AuditRecordInput[] = [];
  const funding = {
    findById: async () => current,
    findByProviderTransactionId: async () => duplicate,
    save: async (value: FundingTransaction) => void fundingSaves.push(value),
  } as unknown as FundingRepository;
  const evidence: BankTransferEvidenceRepository = {
    findForFunding: async () => existing,
    save: async (input) => ({
      id: "evidence-id",
      fundingId: input.fundingId,
      transferReference: input.transferReference,
      proofImageUrl: null,
      customerNote: input.customerNote,
      proof: input.proof,
      createdAt: "2026-01-01T00:00:00.000Z",
      state: "verification_pending",
    }),
  };
  const audit: AuditRecorder = { record: async (input) => void audits.push(input) };
  const service = new BankTransferEvidenceService(
    funding,
    evidence,
    audit,
    { transaction: async (operation) => operation() },
    storage,
    storageName,
  );
  return {
    service,
    fundingSaves,
    audits,
    setExisting: (value: BankTransferEvidence | null) => (existing = value),
    setDuplicate: (value: FundingTransaction | null) => (duplicate = value),
  };
}

describe("BankTransferEvidenceService", () => {
  it("accepts trimmed evidence and moves funding to verification pending", async () => {
    const { service, fundingSaves, audits } = makeService(fundingTransaction("initialization_pending"));
    await expect(
      service.submit(accountId, fundingId, { transferReference: "  BaNk-Ref-ABC123  " }),
    ).resolves.toMatchObject({
      state: "verification_pending",
      transferReference: "BaNk-Ref-ABC123",
    });
    expect(fundingSaves[0]).toMatchObject({
      state: "verification_pending",
      providerTransactionId: "BaNk-Ref-ABC123",
    });
    expect(audits[0].action).toBe("funding.bank_transfer.evidence_submitted");
  });

  it("rejects a transfer reference already claimed by another funding", async () => {
    const setup = makeService();
    setup.setDuplicate({ ...fundingTransaction(), id: "other-funding" });
    await expect(
      setup.service.submit(accountId, fundingId, { transferReference: "bank-ref" }),
    ).rejects.toMatchObject({ code: "provider_transaction_reused", status: 409 });
  });

  it("returns existing evidence without duplicating persistence", async () => {
    const setup = makeService(fundingTransaction("verification_pending"));
    setup.setExisting({
      id: "existing-evidence",
      fundingId,
      transferReference: "bank-ref",
      customerNote: null,
      proofImageUrl: null,
      proof: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      state: "verification_pending",
    });
    await expect(
      setup.service.submit(accountId, fundingId, { customerNote: "repeat" }),
    ).resolves.toMatchObject({ id: "existing-evidence" });
    expect(setup.fundingSaves).toHaveLength(0);
    expect(setup.audits).toHaveLength(0);
  });

  it("requires private storage for proof files", async () => {
    const put = vi.fn();
    const storage = {
      get: () => ({
        name: "public_media",
        visibility: "public",
        put,
        delete: async () => undefined,
        publicUrl: () => "https://public.example/receipt",
      }),
    } as unknown as ObjectStorageRegistry;
    const { service } = makeService(fundingTransaction(), storage, "public_media");
    await expect(
      service.submit(accountId, fundingId, {
        proofFile: {
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          mimeType: "image/png",
        },
      }),
    ).rejects.toThrow("must be private");
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects unsupported or spoofed proof files before storage", () => {
    expect(() => validateProofFile({ bytes: new Uint8Array([1]), mimeType: "text/plain" })).toThrow(
      "Unsupported evidence file type",
    );
    expect(() =>
      validateProofFile({ bytes: new Uint8Array([1, 2, 3]), mimeType: "application/pdf" }),
    ).toThrow("does not match");
  });
});
