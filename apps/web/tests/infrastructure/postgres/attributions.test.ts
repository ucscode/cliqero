import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { PostgresReferralAttributionRepository } from "@/infrastructure/postgres/referral/attributions";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("referral attribution persistence", () => {
  it("stores direct listing and referrer relationships without a link entity", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const repository = new PostgresReferralAttributionRepository({
      query: async <T extends object>(sql: string, values: readonly unknown[] = []) => {
        calls.push({ sql, values });
        return result<T>([]);
      },
    });

    await repository.createAttribution({
      id: "attribution-a",
      listingId: "listing-a",
      referrerAccountId: "account-a",
      tokenHash: Buffer.alloc(32),
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("listing_id,referrer_account_id");
    expect(calls[0].sql).not.toContain("listing_referral_links");
    expect(calls[0].values).toEqual([
      "attribution-a",
      "listing-a",
      "account-a",
      Buffer.alloc(32),
      new Date("2026-01-02T00:00:00.000Z"),
    ]);
  });

  it("resolves the direct attribution facts for an active listing visit", async () => {
    const repository = new PostgresReferralAttributionRepository({
      query: async <T extends object>() =>
        result<T>([
          {
            id: "attribution-a",
            listing_id: "listing-a",
            referrer_account_id: "account-a",
          },
        ] as T[]),
    });

    await expect(repository.resolveActive(Buffer.alloc(32), "listing-a")).resolves.toEqual({
      attributionId: "attribution-a",
      listingId: "listing-a",
      referrerAccountId: "account-a",
    });
  });

  it("persists and claims account attribution separately from listings", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const repository = new PostgresReferralAttributionRepository({
      query: async <T extends object>(sql: string, values: readonly unknown[] = []) => {
        calls.push({ sql, values });
        return result<T>(
          sql.startsWith("update referral_capability.account_attributions")
            ? ([{ referrer_account_id: "account-a" }] as T[])
            : [],
        );
      },
    });

    await repository.createAccountAttribution({
      id: "account-attribution-a",
      referrerAccountId: "account-a",
      tokenHash: Buffer.alloc(32),
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    await expect(repository.resolveAccountAttribution(Buffer.alloc(32))).resolves.toEqual(null);
    await expect(
      repository.claimAccountAttribution(Buffer.alloc(32), "account-b"),
    ).resolves.toEqual({ referrerAccountId: "account-a" });
    await repository.revokeAccountAttribution(Buffer.alloc(32));

    expect(calls[0].sql).toContain("account_attributions");
    expect(calls[0].sql).not.toContain("listing_id");
    expect(calls[0].values).toEqual([
      "account-attribution-a",
      "account-a",
      Buffer.alloc(32),
      new Date("2026-01-02T00:00:00.000Z"),
    ]);
    expect(calls.at(-1)?.sql).toContain("state='revoked'");
  });
});
