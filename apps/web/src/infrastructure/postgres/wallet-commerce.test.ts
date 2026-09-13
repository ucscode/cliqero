import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import { PostgresFundingRepository, PostgresWalletRepository } from "./wallet-commerce";

const accountId = "00000000-0000-4000-8000-000000000001";

function fundingRow(id: string, state: string, providerName = "paystack") {
  return {
    id,
    account_uuid: accountId,
    provider_name: providerName,
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
    expect(query.mock.calls[0]?.[0]).not.toContain("'expired'");
  });

  it("discovers bounded, expired NOWPayments sessions from persisted provider expiry", async () => {
    const query = vi.fn(async (statement: string) =>
      statement.includes("provider_name='nowpayments'")
        ? {
            rows: [
              fundingRow("00000000-0000-4000-8000-000000000014", "awaiting_payment", "nowpayments"),
            ],
          }
        : { rows: [] },
    );
    const repository = new PostgresFundingRepository({ query } as never);
    const expired = await repository.findExpiredNowPayments(
      new Date("2026-09-13T10:00:00.000Z"),
      500,
    );

    expect(expired.map((funding) => funding.id)).toEqual(["00000000-0000-4000-8000-000000000014"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("expiresAt"), [
      "2026-09-13T10:00:00.000Z",
      50,
    ]);
  });

  it("keeps expired funding in normal history while excluding it from active history", async () => {
    const expiredRow = fundingRow("00000000-0000-4000-8000-000000000015", "expired", "nowpayments");
    const query = vi.fn(async (_statement: string, values: unknown[]) =>
      values[3] === false ? { rows: [expiredRow] } : { rows: [] },
    );
    const repository = new PostgresFundingRepository({ query } as never);

    const history = await repository.findHistoryForAccount({ accountId });
    const activeHistory = await repository.findHistoryForAccount({ accountId, active: true });

    expect(history.items.map((funding) => funding.state)).toEqual(["expired"]);
    expect(activeHistory.items).toEqual([]);
    expect(query.mock.calls[1]?.[0]).toContain("state in");
  });

  it("bounds recent wallet activity even when a larger limit is requested", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repository = new PostgresWalletRepository({ query } as never);

    await repository.history(accountId, 500);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("limit $2"), [accountId, 50]);
  });

  it("serializes persisted bank account snapshots with ordered field metadata", async () => {
    const query = vi.fn<(statement: string, values: unknown[]) => Promise<{ rows: unknown[] }>>(
      async () => ({ rows: [] }),
    );
    const repository = new PostgresFundingRepository({ query } as never);
    const snapshot = {
      id: "ng-account",
      collectionCurrency: "NGN",
      fields: [
        { key: "first", label: "First", value: "one" },
        { key: "second", label: "Second", value: "two", copyable: true },
      ],
    };

    await repository.save({
      id: "00000000-0000-4000-8000-000000000013",
      accountId,
      providerName: "bank_transfer",
      providerReference: "bank-reference",
      canonicalAmount: Money.of(1000n, "USD"),
      collectionAmount: Money.of(1326500n, "NGN"),
      state: "awaiting_payment",
      idempotencyKey: "bank-snapshot-repository",
      providerInitialization: {
        providerAccountId: "ng-account",
        providerAccountSnapshot: snapshot,
      },
    });

    const values = query.mock.calls[0]?.[1] as unknown[];
    expect(JSON.parse(String(values[11]))).toMatchObject({
      providerAccountId: "ng-account",
      providerAccountSnapshot: snapshot,
    });
  });
});
