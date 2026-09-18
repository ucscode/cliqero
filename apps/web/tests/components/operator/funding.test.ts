import { describe, expect, it } from "vitest";
import { operatorBankTransferEvidenceRows } from "@/components/operator/funding";

describe("operator bank-transfer evidence presentation", () => {
  it("shows reference, note, proof metadata, and submitted time", () => {
    expect(
      operatorBankTransferEvidenceRows({
        id: "00000000-0000-4000-8000-000000000011",
        transferReference: "bank-ref-123",
        customerNote: "optional context",
        proof: {
          originalFilename: "receipt.png",
          mimeType: "image/png",
          byteSize: "8",
        },
        createdAt: "2026-01-01T00:03:00.000Z",
      }),
    ).toEqual(
      expect.arrayContaining([
        { label: "Transfer reference", value: "bank-ref-123" },
        { label: "Customer note", value: "optional context" },
        { label: "Proof file", value: "receipt.png" },
        { label: "Proof type", value: "image/png" },
        { label: "Proof size", value: "8 bytes" },
        { label: "Submitted", value: expect.any(String) },
      ]),
    );
  });
});
