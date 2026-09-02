import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { OperatorDistributionService, OperatorEarningsService } from "./operator-distributions";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

const ids = {
  distribution: "00000000-0000-4000-8000-000000000010",
  purchase: "00000000-0000-4000-8000-000000000011",
  listing: "00000000-0000-4000-8000-000000000012",
  buyer: "00000000-0000-4000-8000-000000000013",
  beneficiary: "00000000-0000-4000-8000-000000000014",
  entry: "00000000-0000-4000-8000-000000000015",
};

describe("operator distribution and earnings read models", () => {
  it("projects persisted distribution facts without seller economics", async () => {
    const service = new OperatorDistributionService({
      query: async <T extends object>(sql: string) => {
        if (
          sql.includes("from ledger_capability.purchase_distributions d") &&
          sql.includes("group by")
        )
          return result<T>([
            {
              id: ids.distribution,
              purchase_id: ids.purchase,
              listing_id: ids.listing,
              listing_title_snapshot: "Wallet listing",
              buyer_id: ids.buyer,
              buyer_handle: "buyer",
              buyer_email: "buyer@example.com",
              gross_minor: "1001",
              currency: "USD",
              platform_amount_minor: "301",
              referral_allocated_minor: "700",
              beneficiary_count: 2,
              completed_at: "2026-01-01T00:00:00.000Z",
            },
          ] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    await expect(service.list({ limit: 25 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          listingTitle: "Wallet listing",
          grossAmountMinor: "1001",
          referralAllocatedMinor: "700",
          platformRemainderMinor: "301",
          beneficiaryCount: 2,
        }),
      ],
    });
  });

  it("keeps historical policy, attribution, settlement and reversal facts on detail", async () => {
    const service = new OperatorDistributionService({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("from ledger_capability.purchase_distributions d"))
          return result<T>([
            {
              id: ids.distribution,
              purchase_id: ids.purchase,
              listing_id: ids.listing,
              listing_title_snapshot: "Historical listing",
              buyer_id: ids.buyer,
              buyer_handle: "buyer",
              buyer_email: "buyer@example.com",
              gross_minor: "1001",
              currency: "USD",
              platform_amount_minor: "301",
              referral_allocated_minor: "700",
              beneficiary_count: 1,
              completed_at: "2026-01-01T00:00:00.000Z",
              purchase_state: "completed",
              purchase_created_at: "2025-12-31T00:00:00.000Z",
              policy_snapshot: { version: "yaml", levels: [{ level: 1, percentage: 70 }] },
              referral_attribution_id: null,
              referral_link_id: "00000000-0000-4000-8000-000000000016",
              referral_referrer_account_id: ids.beneficiary,
              referrer_handle: "promoter",
              referrer_email: "promoter@example.com",
              attribution_id: null,
            },
          ] as T[]);
        if (sql.includes("from ledger_capability.entries e"))
          return result<T>([
            {
              id: ids.entry,
              account_id: ids.beneficiary,
              handle: "promoter",
              email: "promoter@example.com",
              referral_level: 1,
              amount_minor: "700",
              currency: "USD",
              direction: "credit",
              entry_type: "purchase-earnings",
              balance_state: "pending",
              maturity_at: "2026-01-02T00:00:00.000Z",
              original_entry_id: null,
              reversal_id: null,
              created_at: "2026-01-01T00:00:00.000Z",
              settled_at: null,
            },
          ] as T[]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    await expect(service.get(ids.distribution)).resolves.toMatchObject({
      policySnapshot: { version: "yaml" },
      attribution: { linkId: "00000000-0000-4000-8000-000000000016" },
      allocations: [expect.objectContaining({ amountMinor: "700", balanceState: "pending" })],
    });
  });

  it("projects referral ledger entries and exact pending/available totals", async () => {
    const service = new OperatorEarningsService({
      query: async <T extends object>(sql: string) => {
        if (sql.includes("select e.id,e.account_id"))
          return result<T>([
            {
              id: ids.entry,
              account_id: ids.beneficiary,
              handle: "promoter",
              email: "promoter@example.com",
              purchase_id: ids.purchase,
              distribution_id: ids.distribution,
              entry_type: "purchase-earnings",
              direction: "credit",
              amount_minor: "700",
              currency: "USD",
              referral_level: 1,
              balance_state: "pending",
              effective_state: "pending",
              created_at: "2026-01-01T00:00:00.000Z",
              settled_at: null,
            },
          ] as T[]);
        return result<T>([{ pending_minor: "700", available_minor: "0" }] as T[]);
      },
    });
    await expect(service.list({ limit: 25 })).resolves.toMatchObject({
      totals: { pendingMinor: "700", availableMinor: "0" },
      items: [
        expect.objectContaining({ balanceState: "pending", distributionId: ids.distribution }),
      ],
    });
  });

  it("rejects malformed cursors", async () => {
    const service = new OperatorDistributionService({ query: async () => result([]) });
    await expect(service.list({ limit: 25, cursor: "invalid" })).rejects.toThrow(
      "Invalid pagination cursor",
    );
  });
});
