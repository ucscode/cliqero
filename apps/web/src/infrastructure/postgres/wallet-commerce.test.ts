import { describe, expect, it, vi } from "vitest";
import { PostgresFundingRepository, PostgresWalletRepository } from "./wallet-commerce";

const accountId = "00000000-0000-4000-8000-000000000001";

function fundingRow(id: string, state: string) {
  return {
    id,
    account_uuid: accountId,
    provider_name: "paystack",
    provider_reference: `pay-${id}`,
    canonical_amount_minor: "1000",
    canonical_currency: "USD",
    collection_amount_minor: "1326500",
    collection_currency: "NGN",
    conversion_snapshot: null,
    state,
    idempotency_key: `key-${id}`,
    provider_initialization: null,
    confirmed_at: null,
    initialization_claimed_at: null,
    created_at: new Date("2026-09-12T10:00:00Z"),
    updated_at: new Date("2026-09-12T10:00:00Z"),
  };
}

describe("Postgres wallet and funding projections", () => {
  it("returns every active funding attempt, including multiple awaiting payments", async () => {
    const query = vi.fn(async (statement: string) =>
      statement.includes("state in")
        ? {
            rows: [
              fundingRow("00000000-0000-4000-8000-000000000010", "awaiting_payment"),
              fundingRow("00000000-0000-4000-8000-000000000011", "verification_pending"),
              fundingRow("00000000-0000-4000-8000-000000000012", "initialization_pending"),
            ],
          }
        : { rows: [] },
    );
    const repository = new PostgresFundingRepository({ query } as never);

    const active = await repository.findActiveForAccount(accountId);

    expect(active.map((funding) => funding.id)).toEqual([
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("state in"), [accountId]);
  });

  it("bounds recent wallet activity even when a larger limit is requested", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repository = new PostgresWalletRepository({ query } as never);

    await repository.history(accountId, 500);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("limit $2"), [accountId, 50]);
  });
});
