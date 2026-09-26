import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { POST } from "@/api/compat/wallet/fund/[id]/evidence/route";

const fundingId = "00000000-0000-4000-8000-000000000010";
const account = { id: "00000000-0000-4000-8000-000000000001" };

describe("bank-transfer evidence API", () => {
  it("accepts reference, proof, and note and returns all safe evidence fields", async () => {
    const submit = vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000011",
      fundingId,
      state: "verification_pending" as const,
      createdAt: "2026-09-13T06:00:00.000Z",
      transferReference: "bank-ref-123",
      customerNote: "optional context",
      proof: {
        originalFilename: "receipt.png",
        mimeType: "image/png",
        byteSize: "8",
      },
    }));
    fixtures.container = {
      principalResolver: { resolve: vi.fn(async () => ({ account })) },
      bankTransferEvidence: { submit },
    };

    const body = new FormData();
    body.set("transfer_reference", "bank-ref-123");
    body.set("customer_note", "optional context");
    body.set(
      "proof_file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "receipt.png", {
        type: "image/png",
      }),
    );
    const response = await POST(
      new Request(`http://localhost/api/wallet/fund/${fundingId}/evidence`, {
        method: "POST",
        body,
      }),
      { params: Promise.resolve({ id: fundingId }) },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "00000000-0000-4000-8000-000000000011",
      funding_id: fundingId,
      state: "verification_pending",
      transfer_reference: "bank-ref-123",
      customer_note: "optional context",
      created_at: "2026-09-13T06:00:00.000Z",
      proof: {
        original_filename: "receipt.png",
        mime_type: "image/png",
        byte_size: "8",
      },
    });
    expect(submit).toHaveBeenCalledWith(account.id, fundingId, {
      transferReference: "bank-ref-123",
      customerNote: "optional context",
      proofFile: {
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        mimeType: "image/png",
        filename: "receipt.png",
      },
    });
  });

  it("accepts a transfer reference without a proof upload", async () => {
    const submit = vi.fn(async () => ({
      id: "evidence-id",
      fundingId,
      state: "verification_pending" as const,
      createdAt: "2026-09-13T06:00:00.000Z",
      proof: null,
    }));
    fixtures.container = {
      principalResolver: { resolve: vi.fn(async () => ({ account })) },
      bankTransferEvidence: { submit },
    };

    const body = new FormData();
    body.set("transfer_reference", "bank-ref-only");
    body.set("customer_note", "");
    const response = await POST(
      new Request(`http://localhost/api/wallet/fund/${fundingId}/evidence`, {
        method: "POST",
        body,
      }),
      { params: Promise.resolve({ id: fundingId }) },
    );

    expect(response.status).toBe(201);
    expect(submit).toHaveBeenCalledWith(account.id, fundingId, {
      transferReference: "bank-ref-only",
      customerNote: undefined,
      proofFile: undefined,
    });
  });

  it("accepts a proof upload without a reference or note", async () => {
    const submit = vi.fn(async () => ({
      id: "evidence-id",
      fundingId,
      state: "verification_pending" as const,
      createdAt: "2026-09-13T06:00:00.000Z",
      transferReference: null,
      customerNote: null,
      proof: {
        originalFilename: "receipt.png",
        mimeType: "image/png",
        byteSize: "8",
      },
    }));
    fixtures.container = {
      principalResolver: { resolve: vi.fn(async () => ({ account })) },
      bankTransferEvidence: { submit },
    };

    const body = new FormData();
    body.set("transfer_reference", "");
    body.set("customer_note", "");
    body.set(
      "proof_file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "receipt.png", {
        type: "image/png",
      }),
    );
    const response = await POST(
      new Request(`http://localhost/api/wallet/fund/${fundingId}/evidence`, {
        method: "POST",
        body,
      }),
      { params: Promise.resolve({ id: fundingId }) },
    );

    expect(response.status).toBe(201);
    expect(submit).toHaveBeenCalledWith(
      account.id,
      fundingId,
      expect.objectContaining({
        transferReference: undefined,
        customerNote: undefined,
        proofFile: expect.objectContaining({ mimeType: "image/png" }),
      }),
    );
  });

  it("rejects a note-only multipart submission before creating evidence", async () => {
    const submit = vi.fn();
    fixtures.container = {
      principalResolver: { resolve: vi.fn(async () => ({ account })) },
      bankTransferEvidence: { submit },
    };

    const body = new FormData();
    body.set("transfer_reference", "");
    body.set("customer_note", "Reviewer context only");
    const response = await POST(
      new Request(`http://localhost/api/wallet/fund/${fundingId}/evidence`, {
        method: "POST",
        body,
      }),
      { params: Promise.resolve({ id: fundingId }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Add a transfer reference or proof file before submitting.",
      code: "evidence_required",
    });
    expect(submit).not.toHaveBeenCalled();
  });
});
