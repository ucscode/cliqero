import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "@/api/hono";
import { Money } from "@/modules/money/money";
import { PublicApplicationError } from "@/kernel/errors";

const accountId = "00000000-0000-4000-8000-000000000001";
const principal = {
  kind: "user_session",
  accountId,
  account: { country: "NG" },
  capabilities: [],
  scopes: new Set<string>(),
};

function appFor(prepare: ReturnType<typeof vi.fn>, resolvedPrincipal: any = principal) {
  return createApiApp({
    principalResolver: { resolve: vi.fn(async () => resolvedPrincipal) },
    fundingService: { prepare },
  } as any);
}

describe("funding options projection", () => {
  it("rejects unsupported query fields rather than accepting client collection currency", async () => {
    const prepare = vi.fn();
    const response = await appFor(prepare).fetch(
      new Request(
        "http://localhost/api/funding-options?amount_minor=2500&provider=paystack&collection_currency=NGN",
      ),
    );
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("projects provider options and conversion through the funding service", async () => {
    const prepare = vi.fn(async (input: any) => ({
      provider: input.providerName,
      canonicalAmount: Money.of(2500n, "USD"),
      collectionAmount: Money.of(4000000n, "NGN"),
      paymentCurrency: undefined,
      conversionSnapshot: {
        fromCurrency: "USD",
        toCurrency: "NGN",
        rate: "1600",
        observedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      fundingOptions: [
        {
          id: "bank-1",
          collectionCurrency: "NGN",
          fields: [{ key: "bank", label: "Bank", value: "Example", copyable: true }],
        },
      ],
    }));
    const response = await appFor(prepare).fetch(
      new Request("http://localhost/api/funding-options?amount_minor=2500&provider=bank_transfer"),
    );
    expect(response.status).toBe(200);
    expect(prepare).toHaveBeenCalledWith({
      accountId,
      amountMinor: 2500n,
      providerName: "bank_transfer",
      paymentCurrency: undefined,
      fundingOptionId: undefined,
    });
    expect(await response.json()).toMatchObject({
      provider: "bank_transfer",
      amount_minor: "2500",
      collection_amount_minor: "4000000",
      collection_currency: "NGN",
      funding_options: [{ id: "bank-1" }],
    });
  });

  it("safely rejects unavailable providers and enforces owner funding scope", async () => {
    const prepare = vi.fn(async () => {
      throw new PublicApplicationError("Provider unavailable", "provider_unavailable", 400);
    });
    const unsupported = await appFor(prepare).fetch(
      new Request("http://localhost/api/funding-options?amount_minor=2500&provider=unknown"),
    );
    expect(unsupported.status).toBe(400);
    expect(prepare).toHaveBeenCalledOnce();

    const apiKey = { ...principal, kind: "api_key", capabilities: [], scopes: new Set<string>() };
    const denied = await appFor(vi.fn(), apiKey).fetch(
      new Request("http://localhost/api/funding-options?amount_minor=2500&provider=paystack"),
    );
    expect(denied.status).toBe(403);
  });
});
