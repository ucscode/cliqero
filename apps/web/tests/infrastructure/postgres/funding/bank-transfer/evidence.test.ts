import { describe, expect, it, vi } from "vitest";
import { PostgresBankTransferEvidenceRepository } from "@/infrastructure/postgres/funding/bank-transfer/evidence";

const fundingId = "00000000-0000-4000-8000-000000000010";
const accountId = "00000000-0000-4000-8000-000000000001";

describe("PostgresBankTransferEvidenceRepository", () => {
  it("writes transfer reference, proof metadata, and note in one insert", async () => {
    const query = vi.fn<
      (
        statement: string,
        values: unknown[],
      ) => Promise<{ rows: Array<{ id: string; created_at: Date }> }>
    >(async () => ({
      rows: [{ id: "00000000-0000-4000-8000-000000000011", created_at: new Date() }],
    }));
    const repository = new PostgresBankTransferEvidenceRepository({ query } as never);

    const evidence = await repository.save({
      accountId,
      fundingId,
      transferReference: "bank-ref-123",
      customerNote: "optional context",
      proof: {
        provider: "private_media",
        container: "evidence",
        key: "private/receipt.png",
        originalFilename: "receipt.png",
        mimeType: "image/png",
        byteSize: "8",
      },
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("uuid,funding_id,account_id,transfer_reference,customer_note"),
      [
        fundingId,
        accountId,
        "bank-ref-123",
        "optional context",
        "private_media",
        "evidence",
        "private/receipt.png",
        "receipt.png",
        "image/png",
        "8",
      ],
    );
    expect(query.mock.calls[0]?.[0]).toContain("proof_storage_provider");
    expect(evidence).toMatchObject({
      transferReference: "bank-ref-123",
      customerNote: "optional context",
      proof: { originalFilename: "receipt.png", mimeType: "image/png", byteSize: "8" },
    });
  });
});
