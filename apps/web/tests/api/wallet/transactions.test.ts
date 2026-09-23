import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import type { WalletTransaction } from "@/modules/wallet/wallet";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET } from "@/api/compat/wallet/transactions/route";

const account = { id: "00000000-0000-4000-8000-000000000001" };

describe("wallet transaction API projection", () => {
  it("includes provider references only for funding-credit activity", async () => {
    const fundingCredit: WalletTransaction = {
      kind: "funding_credit",
      id: "00000000-0000-4000-8000-000000000010",
      sourceId: "00000000-0000-4000-8000-000000000011",
      amount: Money.of(2500n, "USD"),
      state: "available",
      createdAt: new Date("2026-09-14T01:49:14.000Z"),
      providerDisplayName: "NOWPayments",
      providerReference: "np-00000000-0000-4000-8000-000000000011",
    };
    const purchaseDebit: WalletTransaction = {
      kind: "purchase_debit",
      id: "00000000-0000-4000-8000-000000000020",
      sourceId: "00000000-0000-4000-8000-000000000021",
      amount: Money.of(100n, "USD"),
      state: "complete",
      createdAt: new Date("2026-09-14T01:48:14.000Z"),
    };
    fixtures.container = {
      principalResolver: { resolve: vi.fn(async () => ({ account })) },
      wallet: { history: vi.fn(async () => [fundingCredit, purchaseDebit]) },
    };

    const response = await GET(new Request("http://localhost/api/wallet/transactions"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.transactions[0]).toMatchObject({
      type: "funding_credit",
      provider_display_name: "NOWPayments",
      provider_reference: "np-00000000-0000-4000-8000-000000000011",
    });
    expect(body.transactions[1]).toMatchObject({ type: "purchase_debit" });
    expect(body.transactions[1]).not.toHaveProperty("provider_reference");
  });

  it("allows a wallet-scoped API key to read only its own wallet", async () => {
    const history = vi.fn(async () => []);
    fixtures.container = {
      principalResolver: {
        resolve: vi.fn(async () => ({
          accountId: account.id,
          account,
          kind: "api_key",
          capabilities: [],
          scopes: new Set(["wallet:read"]),
        })),
      },
      wallet: { history },
    };

    const response = await GET(new Request("http://localhost/api/wallet/transactions"));

    expect(response.status).toBe(200);
    expect(history).toHaveBeenCalledWith(account.id, expect.any(Number));
  });

  it("rejects API keys without wallet:read and unauthenticated requests", async () => {
    fixtures.container = {
      principalResolver: {
        resolve: vi.fn(async () => ({
          accountId: account.id,
          account,
          kind: "api_key",
          capabilities: [],
          scopes: new Set<string>(),
        })),
      },
      wallet: { history: vi.fn(async () => []) },
    };
    expect((await GET(new Request("http://localhost/api/wallet/transactions"))).status).toBe(403);

    fixtures.container.principalResolver.resolve = vi.fn(async () => null);
    expect((await GET(new Request("http://localhost/api/wallet/transactions"))).status).toBe(401);
  });
});
