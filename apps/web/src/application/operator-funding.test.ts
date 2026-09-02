import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { OperatorFundingService } from "./operator-funding";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

const baseRow = {
  id: "00000000-0000-4000-8000-000000000010",
  account_id: "00000000-0000-4000-8000-000000000001",
  handle: "buyer",
  email: "buyer@example.com",
  provider_name: "development",
  provider_reference: "dev-ref-1",
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
};

describe("operator funding projection", () => {
  it("keeps canonical and collection amounts separate and projects wallet credit state", async () => {
    const service = new OperatorFundingService({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("from funding_capability.funding_transactions f"))
          return result<T>([baseRow] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    await expect(service.list({ limit: 25 })).resolves.toMatchObject({
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

  it("does not expose access codes or provider payloads in detail", async () => {
    const service = new OperatorFundingService({
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
    const detail = await service.get(baseRow.id);
    expect(detail.providerInitialization).toEqual({
      authorizationUrl: "https://example.test/authorize",
    });
    expect(JSON.stringify(detail)).not.toContain("secret-access-code");
    expect(detail.operations[0].providerCode).toBe("verification_amount_mismatch");
  });

  it("rejects malformed opaque cursors", async () => {
    const service = new OperatorFundingService({ query: async () => result([]) });
    await expect(service.list({ limit: 25, cursor: "not-a-cursor" })).rejects.toThrow(
      "Invalid pagination cursor",
    );
  });
});
