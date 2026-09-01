import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { PostgresReferralAttributionRepository } from "./attributions";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("referral-link listing projection", () => {
  it("loads listing context in the owner-scoped list query", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const repository = new PostgresReferralAttributionRepository({
      query: async <T extends object>(sql: string, values: readonly unknown[] = []) => {
        calls.push({ sql, values });
        return result<T>([
          {
            id: "link-a",
            code: "share-a",
            listing_id: "listing-a",
            referrer_account_id: "account-a",
            state: "active",
            listing_title: "A useful listing",
            created_at: new Date("2026-01-02T00:00:00.000Z"),
          },
        ] as T[]);
      },
    });

    const links = await repository.listLinks("account-a");

    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual(["account-a"]);
    expect(calls[0].sql).toContain("left join listing_capability.listings");
    expect(calls[0].sql).toContain("where links.referrer_account_id=$1");
    expect(links[0]).toMatchObject({
      listingId: "listing-a",
      listingTitle: "A useful listing",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    });
  });

  it("keeps the link when its listing context is unavailable", async () => {
    const repository = new PostgresReferralAttributionRepository({
      query: async <T extends object>() =>
        result<T>([
          {
            id: "link-a",
            code: "share-a",
            listing_id: "listing-a",
            referrer_account_id: "account-a",
            state: "revoked",
            listing_title: null,
            created_at: new Date("2026-01-02T00:00:00.000Z"),
          },
        ] as T[]),
    });

    await expect(repository.listLinks("account-a")).resolves.toEqual([
      expect.objectContaining({ listingId: "listing-a", listingTitle: null }),
    ]);
  });
});
