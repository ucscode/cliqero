import { describe, expect, it } from "vitest";
import { createApiApp } from "./hono";

const principal = {
  accountId: "00000000-0000-4000-8000-000000000001",
  account: { country: "NG" },
  kind: "user_session" as const,
  capabilities: [],
  scopes: new Set<string>(),
};

describe("wallet funding-method API contract", () => {
  it("returns plural collection currencies without the legacy singular field", async () => {
    let receivedContext: unknown;
    const app = createApiApp({
      principalResolver: { resolve: async () => principal },
      providers: {
        availableMethodsFor: (context: unknown) => {
          receivedContext = context;
          return [
            {
              provider: {
                name: "usdt_trc20",
                displayName: "Direct USDT TRC20",
                imageUrl: "/images/payment/usdt-trc20.svg",
                description: "Send USDT on the TRON TRC20 network directly.",
              },
              collectionCurrency: "USD",
              collectionCurrencies: ["USD"],
              paymentCurrencies: [],
              defaultPaymentCurrency: undefined,
            },
          ];
        },
      },
    } as any);

    const response = await app.fetch(
      new Request("http://localhost/api/wallet/funding-methods", {
        headers: { authorization: "Bearer test" },
      }),
    );

    expect(response.status).toBe(200);
    expect(receivedContext).toEqual({ country: "NG" });
    expect(await response.json()).toEqual({
      methods: [
        {
          id: "usdt_trc20",
          display_name: "Direct USDT TRC20",
          image_url: "/images/payment/usdt-trc20.svg",
          description: "Send USDT on the TRON TRC20 network directly.",
          test_only: null,
          collection_currencies: ["USD"],
          payment_currencies: [],
          default_payment_currency: null,
        },
      ],
    });
  });

  it("preserves multiple eligible collection currencies", async () => {
    const app = createApiApp({
      principalResolver: { resolve: async () => principal },
      providers: {
        availableMethodsFor: () => [
          {
            provider: {
              name: "bank_transfer",
              displayName: "Bank transfer",
              imageUrl: "/images/payment/bank-transfer.svg",
              description: "Transfer funds from your bank.",
            },
            collectionCurrency: "USD",
            collectionCurrencies: ["USD", "NGN"],
            paymentCurrencies: [],
            defaultPaymentCurrency: undefined,
          },
        ],
      },
    } as any);

    const response = await app.fetch(new Request("http://localhost/api/wallet/funding-methods"));
    expect((await response.json()).methods[0].collection_currencies).toEqual(["USD", "NGN"]);
  });

  it("surfaces a provider's test-only marker without making it a client security boundary", async () => {
    const app = createApiApp({
      principalResolver: { resolve: async () => principal },
      providers: {
        availableMethodsFor: () => [
          {
            provider: {
              name: "development",
              displayName: "Development",
              imageUrl: "/images/payment/development.svg",
              description: "Development-only funding for local testing.",
              environmentOnly: "development",
            },
            collectionCurrency: "USD",
            collectionCurrencies: ["USD"],
            paymentCurrencies: [],
            defaultPaymentCurrency: undefined,
          },
        ],
      },
    } as any);

    const response = await app.fetch(new Request("http://localhost/api/wallet/funding-methods"));

    expect((await response.json()).methods[0].test_only).toBe("development");
  });
});
