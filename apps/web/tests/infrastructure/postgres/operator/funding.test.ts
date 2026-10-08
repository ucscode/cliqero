import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { PostgresOperatorFundingReader } from "@/infrastructure/postgres/operator/funding";
import { FUNDING_PROOF_CLEANUP_EVENT } from "@/kernel/events";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

const baseRow = {
  id: "00000000-0000-4000-8000-000000000010",
  account_id: "00000000-0000-4000-8000-000000000001",
  username: "buyer",
  email: "buyer@example.com",
  provider_name: "development",
  provider_reference: "dev-ref-1",
  provider_transaction_id: null,
  canonical_amount_minor: "1000",
  collection_amount_minor: "1000",
  collection_currency: "USD",
  state: "confirmed",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:01:00.000Z",
  confirmed_at: "2026-01-01T00:01:00.000Z",
  credit_id: "00000000-0000-4000-8000-000000000020",
  credit_amount_minor: "1000",
  credit_currency: "USD",
  credit_state: "available",
  credit_created_at: "2026-01-01T00:01:00.000Z",
  credit_available_at: "2026-01-01T00:02:00.000Z",
  wallet_effect_minor: null,
  wallet_effect_state: null,
};

describe("PostgresOperatorFundingReader", () => {
  it("keeps canonical and collection amounts separate and projects wallet credit state", async () => {
    const reader = new PostgresOperatorFundingReader({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("from funding_capability.funding_transactions f"))
          return result<T>([baseRow] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    await expect(reader.list({ limit: 25 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          canonicalAmountMinor: "1000",
          canonicalCurrency: "USD",
          collectionAmountMinor: "1000",
          collectionCurrency: "USD",
          walletCredit: expect.objectContaining({ state: "available" }),
        }),
      ],
      nextCursor: null,
    });
  });

  it("uses a public UUID tie-breaker and rejects cursor reuse under a different sort", async () => {
    const statements: string[] = [];
    const reader = new PostgresOperatorFundingReader({
      query: async <T extends object>(sql: string) => {
        statements.push(sql);
        return result<T>([
          {
            ...baseRow,
            id: "00000000-0000-4000-8000-000000000011",
            cursor_sort_value: "1000",
          },
          {
            ...baseRow,
            id: "00000000-0000-4000-8000-000000000012",
            cursor_sort_value: "2000",
          },
        ] as T[]);
      },
    });
    const first = await reader.list({ limit: 1, sort: "amount", direction: "asc" });
    expect(statements[0]).toContain("order by q.canonical_amount_minor asc,q.id asc");
    expect(first.nextCursor).toBeTruthy();
    await expect(
      reader.list({ limit: 1, sort: "created", direction: "desc", cursor: first.nextCursor! }),
    ).rejects.toThrow("Invalid or stale pagination cursor");
    await reader.list({ limit: 1, sort: "amount", direction: "asc", cursor: first.nextCursor! });
    expect(statements[1]).toContain("(q.canonical_amount_minor,q.id) > ($6::bigint,$7::uuid)");
    const decoded = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"));
    expect(decoded.id).toBe("00000000-0000-4000-8000-000000000011");
  });

  it("returns null for an ID absent from both funding origins", async () => {
    const reader = new PostgresOperatorFundingReader({
      query: async <T extends object>() => result<T>([]),
    });
    await expect(reader.get("00000000-0000-4000-8000-000000000099")).resolves.toBeNull();
  });

  it("rejects malformed funding cursors as a public 400", async () => {
    const reader = new PostgresOperatorFundingReader({
      query: async <T extends object>() => result<T>([]),
    });
    await expect(
      reader.list({ limit: 1, sort: "amount", direction: "asc", cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({ code: "invalid_cursor", status: 400 });
  });

  it("projects administrative funding movements as an available wallet effect", async () => {
    const reader = new PostgresOperatorFundingReader({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("administrative_fundings"))
          return result<T>([
            {
              ...baseRow,
              origin: "administrative",
              provider_name: null,
              provider_reference: null,
              reason: "Support credit",
              administrative_reference: "admin-1",
              created_by: "00000000-0000-4000-8000-000000000009",
              credit_id: null,
              wallet_effect_minor: "2500",
              wallet_effect_state: "available",
            },
          ] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    await expect(reader.list({ limit: 25 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          origin: "administrative",
          walletCredit: null,
          walletEffect: { amountMinor: "2500", currency: "USD", state: "available" },
        }),
      ],
    });
  });

  it("does not expose access codes or provider payloads in detail", async () => {
    const reader = new PostgresOperatorFundingReader({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("from funding_capability.funding_transactions f"))
          return result<T>([
            {
              ...baseRow,
              conversion_snapshot: {
                fromCurrency: "USD",
                toCurrency: "NGN",
                rate: "1500.25",
                source: "test",
                sourceDate: "2026-01-01",
                observedAt: "2026-01-01T00:00:00.000Z",
              },
              provider_initialization: {
                authorizationUrl: "https://example.test/authorize",
                accessCode: "secret-access-code",
              },
            },
          ] as T[]);
        if (sql.includes("provider_operations"))
          return result<T>([
            {
              id: "00000000-0000-4000-8000-000000000030",
              operation: "transaction.verify",
              outcome: "failed",
              http_status: 400,
              provider_status: false,
              provider_message: "safe message",
              provider_code: "verification_amount_mismatch",
              failure_kind: "rejection",
              occurred_at: "2026-01-01T00:03:00.000Z",
            },
          ] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    const detail = await reader.get(baseRow.id);
    if (!detail) throw new Error("Expected funding detail");
    expect(detail.providerInitialization).toEqual({
      authorizationUrl: "https://example.test/authorize",
    });
    expect(JSON.stringify(detail)).not.toContain("secret-access-code");
    expect(detail.operations[0].providerCode).toBe("verification_amount_mismatch");
  });

  it("projects complete bank-transfer evidence without storage internals", async () => {
    const reader = new PostgresOperatorFundingReader({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("from funding_capability.funding_transactions f"))
          return result<T>([baseRow] as T[]);
        if (sql.includes("funding_capability.funding_evidence"))
          return result<T>([
            {
              id: "00000000-0000-4000-8000-000000000030",
              transfer_reference: "bank-ref-123",
              customer_note: "optional context",
              proof_storage_provider: "private_media",
              proof_storage_container: "evidence",
              proof_object_key: "private/receipt.png",
              proof_original_filename: "receipt.png",
              proof_mime_type: "image/png",
              proof_byte_size: "8",
              created_at: "2026-01-01T00:03:00.000Z",
            },
          ] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });

    const detail = await reader.get(baseRow.id);
    if (!detail) throw new Error("Expected funding detail");
    expect(detail.evidence).toEqual({
      id: "00000000-0000-4000-8000-000000000030",
      transferReference: "bank-ref-123",
      customerNote: "optional context",
      proof: {
        originalFilename: "receipt.png",
        mimeType: "image/png",
        byteSize: "8",
      },
      createdAt: "2026-01-01T00:03:00.000Z",
    });
    expect(JSON.stringify(detail)).not.toContain("private/receipt.png");
    expect(JSON.stringify(detail)).not.toContain("private_media");
  });

  it("locks provider funding before reading its deletion snapshot and collects proof locators", async () => {
    const statements: string[] = [];
    const events: object[] = [];
    const reader = new PostgresOperatorFundingReader(
      {
        query: async <T extends object>(sql: string) => {
          statements.push(sql);
          if (sql.includes("where uuid=$1 for update")) return result<T>([{ id: "42" }] as T[]);
          if (sql.includes("from funding_capability.funding_transactions f"))
            return result<T>([baseRow] as T[]);
          if (sql.includes("select proof_storage_provider as provider"))
            return result<T>([
              { provider: "private_media", container: "evidence", key: "private/receipt.png" },
              { provider: "private_media", container: "evidence", key: "private/other.png" },
            ] as T[]);
          if (sql.startsWith("delete from funding_capability.funding_transactions"))
            return result<T>([{}] as T[]);
          return result<T>([]) as QueryResult<T>;
        },
      },
      {
        append: async (pending) => {
          events.push(...pending);
        },
      },
    );

    await expect(reader.deleteForRoot(baseRow.id, "root-1")).resolves.toEqual({
      id: baseRow.id,
      deleted: true,
    });
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: FUNDING_PROOF_CLEANUP_EVENT,
          aggregateId: baseRow.id,
          payload: {
            fundingId: baseRow.id,
            storageProvider: "private_media",
            container: "evidence",
            key: "private/receipt.png",
          },
        }),
        expect.objectContaining({
          name: FUNDING_PROOF_CLEANUP_EVENT,
          aggregateId: baseRow.id,
          payload: {
            fundingId: baseRow.id,
            storageProvider: "private_media",
            container: "evidence",
            key: "private/other.png",
          },
        }),
      ]),
    );
    expect(statements[0]).toContain("select account.uuid account_id");
    expect(statements[1]).toContain("pg_advisory_xact_lock");
    expect(statements[2]).toContain("where uuid=$1 for update");
    expect(statements[3]).toContain("from funding_capability.funding_transactions f");
  });

  it("rejects malformed opaque cursors", async () => {
    const reader = new PostgresOperatorFundingReader({ query: async () => result([]) });
    await expect(reader.list({ limit: 25, cursor: "not-a-cursor" })).rejects.toThrow(
      "Invalid or stale pagination cursor",
    );
  });
});
