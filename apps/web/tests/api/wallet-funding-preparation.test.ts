import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET } from "@/api/compat/wallet/funding/prepare/route";

const account = {
  id: "00000000-0000-4000-8000-000000000001",
  country: "NG",
};

function configure() {
  const prepare = vi.fn(async (input: Record<string, unknown>) => ({
    provider: String(input.providerName),
    canonicalAmount: Money.of(2500n, "USD"),
    collectionAmount: Money.of(4000000n, "NGN"),
    paymentCurrency: undefined,
    conversionSnapshot: undefined,
    fundingOptions: [],
  }));
  fixtures.container = {
    principalResolver: { resolve: vi.fn(async () => ({ account })) },
    fundingService: { prepare },
  };
  return prepare;
}

describe("wallet funding preparation API contract", () => {
  it("does not accept generic collection currency input", async () => {
    const prepare = configure();
    const response = await GET(
      new Request(
        "http://localhost/api/wallet/funding/prepare?amount_minor=2500&provider=paystack&collection_currency=NGN",
      ),
    );

    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("prepares from canonical amount and provider without collection currency input", async () => {
    const prepare = configure();
    const response = await GET(
      new Request(
        "http://localhost/api/wallet/funding/prepare?amount_minor=2500&provider=paystack",
      ),
    );

    expect(response.status).toBe(200);
    expect(prepare).toHaveBeenCalledWith({
      accountId: account.id,
      amountMinor: 2500n,
      providerName: "paystack",
      paymentCurrency: undefined,
      fundingOptionId: undefined,
    });
    expect(await response.json()).toMatchObject({
      amount_minor: "2500",
      currency: "USD",
      collection_amount_minor: "4000000",
      collection_currency: "NGN",
    });
  });
});
