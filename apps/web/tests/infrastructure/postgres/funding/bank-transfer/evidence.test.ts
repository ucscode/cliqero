import { describe, expect, it, vi } from "vitest";
import type { QueryResult } from "pg";
import {
  BankTransferEvidenceService,
  validateProofFile,
  type BankTransferProofFile,
} from "@/infrastructure/postgres/funding/bank-transfer/evidence";

const fundingId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("bank-transfer evidence", () => {
  it("accepts evidence from a newly-created pending funding", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    const service = new BankTransferEvidenceService({
      query: async <T extends object>(sql: string, values?: unknown[]) => {
        statements.push(sql);
        parameters.push(values ?? []);
        if (sql.includes("select uuid as id,transfer_reference")) return result<T>([]);
        if (sql.includes("returning uuid"))
          return result<T>([{ id: "evidence-id", created_at: new Date() }] as T[]);
        if (
          sql.includes("from funding_capability.funding_transactions") &&
          !sql.includes("funding_evidence")
        )
          return result<T>([
            {
              id: fundingId,
              account_id: 7,
              provider_name: "bank_transfer",
              state: "initialization_pending",
              provider_transaction_id: null,
            },
          ] as T[]);
        if (sql.includes("select uuid from identity_capability.accounts"))
          return result<T>([{ uuid: accountId }] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });

    await expect(
      service.submit(accountId, fundingId, { transferReference: "  BaNk-Ref-ABC123  " }),
    ).resolves.toMatchObject({
      state: "verification_pending",
      transferReference: "BaNk-Ref-ABC123",
    });
    expect(statements.some((sql) => sql.includes("provider_transaction_id=coalesce"))).toBe(true);
    expect(parameters).toContainEqual([fundingId, "BaNk-Ref-ABC123"]);
    expect(statements.some((sql) => sql.includes("state='confirmed'"))).toBe(false);
  });

  it("rejects a transfer reference claimed by another bank funding", async () => {
    const service = new BankTransferEvidenceService({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("select uuid as id,transfer_reference")) return result<T>([]);
        if (sql.includes("where f.provider_name=$1"))
          return result<T>([{ id: "other-funding" }] as T[]);
        if (
          sql.includes("from funding_capability.funding_transactions") &&
          !sql.includes("funding_evidence")
        )
          return result<T>([
            {
              id: fundingId,
              account_id: 7,
              provider_name: "bank_transfer",
              state: "awaiting_payment",
              provider_transaction_id: null,
            },
          ] as T[]);
        if (sql.includes("select uuid from identity_capability.accounts"))
          return result<T>([{ uuid: accountId }] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });

    await expect(
      service.submit(accountId, fundingId, { transferReference: "bank-ref" }),
    ).rejects.toMatchObject({ code: "provider_transaction_reused", status: 409 });
  });

  it("accepts evidence while bank details are being initialized", async () => {
    const service = new BankTransferEvidenceService({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("select uuid as id,transfer_reference")) return result<T>([]);
        if (sql.includes("returning uuid"))
          return result<T>([{ id: "evidence-id", created_at: new Date() }] as T[]);
        if (
          sql.includes("from funding_capability.funding_transactions") &&
          !sql.includes("funding_evidence")
        )
          return result<T>([
            {
              id: fundingId,
              account_id: 7,
              provider_name: "bank_transfer",
              state: "initializing",
            },
          ] as T[]);
        if (sql.includes("select uuid from identity_capability.accounts"))
          return result<T>([{ uuid: accountId }] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });

    await expect(
      service.submit(accountId, fundingId, { customerNote: "Transfer sent" }),
    ).resolves.toMatchObject({ state: "verification_pending", customerNote: "Transfer sent" });
  });

  it("requires meaningful evidence and moves owned bank funding to review", async () => {
    const statements: string[] = [];
    const service = new BankTransferEvidenceService({
      query: async <T extends object>(sql: string) => {
        statements.push(sql);
        if (sql.includes("returning uuid"))
          return result<T>([
            { id: "00000000-0000-4000-8000-000000000003", created_at: new Date() },
          ] as T[]);
        if (
          sql.includes("from funding_capability.funding_transactions") &&
          !sql.includes("funding_evidence")
        )
          return result<T>([
            {
              id: fundingId,
              account_id: 7,
              provider_name: "bank_transfer",
              state: "awaiting_payment",
            },
          ] as T[]);
        if (sql.includes("select uuid from identity_capability.accounts"))
          return result<T>([{ uuid: accountId }] as T[]);
        if (sql.includes("select uuid as id,transfer_reference")) return result<T>([]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    await expect(
      service.submit(accountId, fundingId, { customerNote: "Transfer sent" }),
    ).resolves.toMatchObject({ state: "verification_pending", customerNote: "Transfer sent" });
    await expect(service.submit(accountId, fundingId, {})).rejects.toThrow(
      "At least one transfer evidence item",
    );
    expect(
      statements.some((sql) => sql.includes("update funding_capability.funding_transactions")),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes("insert into kernel.audit_records"))).toBe(true);
  });

  it.each([[{ transferReference: "bank-ref" }, "bank-ref", null]])(
    "accepts a single meaningful evidence field: %o",
    async (input, reference, proof) => {
      const service = new BankTransferEvidenceService({
        query: async <T extends object>(sql: string) => {
          if (sql.includes("select uuid as id,transfer_reference")) return result<T>([]);
          if (sql.includes("returning uuid"))
            return result<T>([{ id: "evidence-id", created_at: new Date() }] as T[]);
          if (sql.includes("from funding_capability.funding_transactions"))
            return result<T>([
              {
                id: fundingId,
                account_id: 7,
                provider_name: "bank_transfer",
                state: "awaiting_payment",
              },
            ] as T[]);
          if (sql.includes("select uuid from identity_capability.accounts"))
            return result<T>([{ uuid: accountId }] as T[]);
          return result<T>([]) as QueryResult<T>;
        },
      });
      await expect(service.submit(accountId, fundingId, input)).resolves.toMatchObject({
        state: "verification_pending",
        transferReference: reference,
        proofImageUrl: proof,
        customerNote: null,
      });
    },
  );

  it.each([
    ["image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["application/pdf", new TextEncoder().encode("%PDF-1.7")],
  ])("accepts %s proof files", async (mimeType, bytes) => {
    const stored = {
      provider: "payment_evidence",
      container: "payment-evidence",
      key: "funding-evidence/funding/receipt",
      byteSize: bytes.byteLength,
      mimeType,
    };
    const put = vi.fn(async () => stored);
    const service = new BankTransferEvidenceService(
      {
        query: async <T extends object>(sql: string) => {
          if (sql.includes("select uuid as id,transfer_reference")) return result<T>([]);
          if (sql.includes("returning uuid"))
            return result<T>([{ id: "evidence-id", created_at: new Date() }] as T[]);
          if (sql.includes("from funding_capability.funding_transactions"))
            return result<T>([
              {
                id: fundingId,
                account_id: 7,
                provider_name: "bank_transfer",
                state: "awaiting_payment",
              },
            ] as T[]);
          if (sql.includes("select uuid from identity_capability.accounts"))
            return result<T>([{ uuid: accountId }] as T[]);
          return result<T>([]) as QueryResult<T>;
        },
      },
      undefined,
      {
        default: () => ({
          name: "payment_evidence",
          visibility: "private",
          put,
          delete: async () => undefined,
          publicUrl: () => "",
        }),
        get: () => ({
          name: "payment_evidence",
          visibility: "private",
          put,
          delete: async () => undefined,
          publicUrl: () => "",
        }),
      } as any,
      "payment_evidence",
    );
    const file: BankTransferProofFile = { bytes, mimeType, filename: "receipt" };
    await expect(service.submit(accountId, fundingId, { proofFile: file })).resolves.toMatchObject({
      state: "verification_pending",
      proof: {
        provider: "payment_evidence",
        container: "payment-evidence",
        mimeType,
        byteSize: String(bytes.byteLength),
      },
    });
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^funding-evidence\//),
        bytes,
        mimeType,
      }),
    );
  });

  it("rejects a public storage instance for bank-transfer proof", async () => {
    const service = new BankTransferEvidenceService(
      {
        query: async <T extends object>(sql: string) => {
          if (sql.includes("select uuid as id,transfer_reference")) return result<T>([]);
          if (
            sql.includes("from funding_capability.funding_transactions") &&
            !sql.includes("funding_evidence")
          )
            return result<T>([
              {
                id: fundingId,
                account_id: 7,
                provider_name: "bank_transfer",
                state: "awaiting_payment",
              },
            ] as T[]);
          if (sql.includes("select uuid from identity_capability.accounts"))
            return result<T>([{ uuid: accountId }] as T[]);
          return result<T>([]) as QueryResult<T>;
        },
      },
      undefined,
      {
        get: () => ({
          name: "public_media",
          visibility: "public",
          put: vi.fn(),
          delete: async () => undefined,
          publicUrl: () => "https://public.example/receipt",
        }),
      } as any,
      "public_media",
    );

    await expect(
      service.submit(accountId, fundingId, {
        proofFile: {
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          mimeType: "image/png",
        },
      }),
    ).rejects.toThrow("must be private");
  });

  it("rejects unsupported or spoofed proof files before storage", () => {
    expect(() => validateProofFile({ bytes: new Uint8Array([1]), mimeType: "text/plain" })).toThrow(
      "Unsupported evidence file type",
    );
    expect(() =>
      validateProofFile({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "application/pdf",
      }),
    ).toThrow("does not match");
  });

  it("returns existing evidence without creating a duplicate", async () => {
    const statements: string[] = [];
    const service = new BankTransferEvidenceService({
      query: async <T extends object>(sql: string) => {
        statements.push(sql);
        if (sql.includes("select uuid as id,transfer_reference"))
          return result<T>([
            {
              id: "existing-evidence",
              transfer_reference: "bank-ref",
              proof_image_url: null,
              customer_note: null,
              created_at: new Date(),
            },
          ] as T[]);
        if (sql.includes("from funding_capability.funding_transactions"))
          return result<T>([
            {
              id: fundingId,
              account_id: 7,
              provider_name: "bank_transfer",
              state: "verification_pending",
            },
          ] as T[]);
        if (sql.includes("select uuid from identity_capability.accounts"))
          return result<T>([{ uuid: accountId }] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    await expect(
      service.submit(accountId, fundingId, { customerNote: "repeat" }),
    ).resolves.toMatchObject({
      id: "existing-evidence",
      state: "verification_pending",
    });
    expect(
      statements.some((sql) => sql.includes("insert into funding_capability.funding_evidence")),
    ).toBe(false);
  });

  it("does not permit evidence on another account's funding", async () => {
    const service = new BankTransferEvidenceService({
      query: async <T extends object>(sql: string) =>
        sql.includes("from funding_capability.funding_transactions") &&
        !sql.includes("funding_evidence")
          ? result<T>([
              {
                id: fundingId,
                account_id: 7,
                provider_name: "bank_transfer",
                state: "awaiting_payment",
              },
            ] as T[])
          : (result<T>([]) as QueryResult<T>),
    });
    await expect(
      service.submit("other-account", fundingId, { customerNote: "claim" }),
    ).rejects.toThrow("Funding not found");
  });
});
