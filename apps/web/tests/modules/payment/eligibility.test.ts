import { describe, expect, it, vi } from "vitest";
import { PaymentProviderRegistry } from "@/modules/payment";
import { DevelopmentPaymentProvider } from "@/providers/payment/development/provider";
import {
  isDevelopmentProviderEnabled,
  registerDevelopmentPaymentProvider,
} from "@/providers/payment/development/registration";
import { PaystackProvider } from "@/providers/payment/paystack/provider";
import { NowPaymentsProvider } from "@/providers/payment/nowpayments/provider";
import { BankTransferProvider } from "@/providers/payment/bank-transfer/provider";
import { DirectTrc20Provider } from "@/providers/payment/direct-trc20/provider";
import { ProviderConfigurationError } from "@/kernel/provider-error";
import type { DirectTrc20Verifier } from "@/providers/payment/direct-trc20/verifier";
const context = (country: string | null) => ({ country });
describe("payment provider eligibility", () => {
  it("applies enabled country filters without a currency", () => {
    const registry = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider(), {
      enabled: true,
      filters: { countries: ["NG"] },
    });
    expect(registry.availableFor(context("NG"))).toHaveLength(1);
    expect(registry.availableFor(context("GH"))).toHaveLength(0);
  });
  it("keeps valid providers usable when another provider configuration fails", () => {
    const registry = new PaymentProviderRegistry()
      .registerFailure("paystack", new Error("invalid Paystack test configuration"))
      .register(
        new NowPaymentsProvider({
          apiKey: "test",
          apiBaseUrl: "https://api-sandbox.nowpayments.io",
          payCurrencies: ["usdttrc20"],
        }),
      );

    expect(() => registry.get("paystack")).toThrow(
      "Payment provider configuration is invalid: paystack",
    );
    expect(registry.get("nowpayments").name).toBe("nowpayments");
  });
  it("materializes only the requested lazy provider and memoizes success", () => {
    const paystack = new PaystackProvider({
      secretKey: "test",
      apiBaseUrl: "https://api.paystack.co",
    });
    const nowPayments = new NowPaymentsProvider({
      apiKey: "test",
      apiBaseUrl: "https://api.nowpayments.io",
      payCurrencies: ["usdttrc20"],
    });
    const paystackFactory = vi.fn(() => ({ provider: paystack }));
    const nowPaymentsFactory = vi.fn(() => ({ provider: nowPayments }));
    const registry = new PaymentProviderRegistry()
      .registerLazy("paystack", paystackFactory)
      .registerLazy("nowpayments", nowPaymentsFactory);

    expect(paystackFactory).not.toHaveBeenCalled();
    expect(nowPaymentsFactory).not.toHaveBeenCalled();
    expect(registry.get("paystack")).toBe(paystack);
    expect(registry.get("paystack")).toBe(paystack);
    expect(paystackFactory).toHaveBeenCalledOnce();
    expect(nowPaymentsFactory).not.toHaveBeenCalled();
  });
  it("isolates lazy configuration failures from available methods", () => {
    const valid = new NowPaymentsProvider({
      apiKey: "test",
      apiBaseUrl: "https://api.nowpayments.io",
      payCurrencies: ["usdttrc20"],
    });
    const brokenFactory = vi.fn(() => {
      throw new ProviderConfigurationError(
        "bank_transfer",
        "Payment provider configuration is invalid: bank_transfer",
      );
    });
    const registry = new PaymentProviderRegistry()
      .registerLazy("bank_transfer", brokenFactory)
      .register(valid);

    expect(registry.availableMethodsFor(context("NG")).map((item) => item.provider.name)).toEqual([
      "nowpayments",
    ]);
    expect(brokenFactory).toHaveBeenCalledOnce();
    expect(() => registry.get("bank_transfer")).toThrow(
      "Payment provider configuration is invalid",
    );
  });

  it("does not swallow unexpected provider implementation errors", () => {
    const registry = new PaymentProviderRegistry().registerLazy("buggy", () => {
      throw new TypeError("provider implementation bug");
    });

    expect(() => registry.availableFor(context("NG"))).toThrow("provider implementation bug");
  });
  it("keeps Paystack collection currency separate from country eligibility", () => {
    const registry = new PaymentProviderRegistry().register(
      new PaystackProvider({ secretKey: "test", apiBaseUrl: "https://api.paystack.co" }),
      { filters: { countries: ["NG"] } },
    );
    expect(registry.collectionCurrency("paystack")).toBe("NGN");
    expect(registry.availableFor(context("NG"))).toHaveLength(1);
    expect(registry.availableMethodsFor({ country: "NG" })[0].collectionCurrencies).toEqual([
      "NGN",
    ]);
    expect(registry.availableMethodsFor({ country: "NG" })[0].customerActionLabel).toBe("Pay now");
    expect(registry.availableFor(context("US"))).toHaveLength(0);
  });

  it("gates Paystack visibility by the provider-level country filter", () => {
    const registry = new PaymentProviderRegistry().register(
      new PaystackProvider({ secretKey: "test", apiBaseUrl: "https://api.paystack.co" }),
      { filters: { countries: ["NG"] } },
    );

    expect(registry.availableFor(context("NG")).map((provider) => provider.name)).toEqual([
      "paystack",
    ]);
    expect(registry.availableFor(context("US"))).toEqual([]);
  });

  it("applies unrestricted and restricted provider filters to NOWPayments", () => {
    const unrestricted = new PaymentProviderRegistry().register(
      new NowPaymentsProvider({
        apiKey: "test",
        apiBaseUrl: "https://api-sandbox.nowpayments.io",
        payCurrencies: ["usdttrc20"],
      }),
      { filters: { countries: null } },
    );
    expect(unrestricted.availableFor(context("NG"))).toHaveLength(1);
    expect(unrestricted.availableFor(context("US"))).toHaveLength(1);

    const restricted = new PaymentProviderRegistry().register(
      new NowPaymentsProvider({
        apiKey: "test",
        apiBaseUrl: "https://api-sandbox.nowpayments.io",
        payCurrencies: ["usdttrc20"],
      }),
      { filters: { countries: ["NG"] } },
    );
    expect(restricted.availableFor(context("NG"))).toHaveLength(1);
    expect(restricted.availableFor(context("US"))).toEqual([]);
  });

  it("applies the same provider-level filter to direct TRC20", () => {
    const verifier = {
      verify: async () => {
        throw new Error("unused");
      },
    } satisfies DirectTrc20Verifier;
    const registry = new PaymentProviderRegistry().register(
      new DirectTrc20Provider(
        {
          walletAddress: "Tabc",
          confirmationsRequired: 6,
          maxTransactionAgeSeconds: 86400,
          tokenContract: "Tusdt",
          verification: { provider: "trongrid", apiBaseUrl: "https://api.shasta.trongrid.io" },
        },
        verifier,
      ),
      { filters: { countries: ["NG"] } },
    );

    expect(registry.availableFor(context("NG"))).toHaveLength(1);
    expect(registry.availableFor(context("US"))).toEqual([]);
  });
  it("treats null filters as unrestricted and disabled providers as unavailable", () => {
    const registry = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider(), {
      enabled: false,
      filters: { countries: null },
    });
    expect(registry.availableFor(context(null))).toHaveLength(0);
    const open = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider(), {
      filters: { countries: null },
    });
    expect(open.availableFor(context(null))).toHaveLength(1);
  });
  it("rejects a manually selected ineligible provider", () => {
    const registry = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider(), {
      filters: { countries: ["NG"] },
    });
    expect(() => registry.get("development", context("GH"))).toThrow("unavailable");
  });

  it("exposes the direct customer method identifiers", () => {
    const now = {
      apiKey: "test",
      apiBaseUrl: "https://api-sandbox.nowpayments.io",
      payCurrencies: ["btc"],
    };
    const registry = new PaymentProviderRegistry()
      .register(new NowPaymentsProvider(now, "nowpayments"))
      .register(
        new DirectTrc20Provider(
          {
            walletAddress: "Tabc",
            confirmationsRequired: 6,
            maxTransactionAgeSeconds: 86400,
            tokenContract: "Tusdt",
            verification: { provider: "trongrid", apiBaseUrl: "https://api.shasta.trongrid.io" },
          },
          {
            verify: async () => {
              throw new Error("unused");
            },
          } satisfies DirectTrc20Verifier,
        ),
      )
      .register(
        new BankTransferProvider({
          accounts: [
            {
              id: "default",
              fields: [{ key: "bank", label: "Bank", value: "Bank" }],
              filters: { countries: null },
            },
          ],
        }),
        {
          filters: { countries: null },
        },
      );
    expect(registry.availableFor(context(null)).map((provider) => provider.name)).toEqual([
      "nowpayments",
      "usdt_trc20",
      "bank_transfer",
    ]);
  });

  it("applies bank provider country visibility before account selection", () => {
    const registry = new PaymentProviderRegistry().register(
      new BankTransferProvider({
        currencyMapping: { enabled: true },
        accounts: [
          {
            id: "ng",
            fields: [{ key: "bank", label: "Bank", value: "Nigeria" }],
            filters: { countries: ["NG"] },
          },
          {
            id: "us",
            fields: [{ key: "bank", label: "Bank", value: "United States" }],
            filters: { countries: ["US"] },
          },
        ],
      }),
      { filters: { countries: ["NG", "US"] } },
    );
    expect(registry.availableMethodsFor({ country: "NG" })[0].collectionCurrencies).toEqual([
      "NGN",
    ]);
    expect(registry.availableMethodsFor({ country: "US" })[0].collectionCurrencies).toEqual([
      "USD",
    ]);
    expect(registry.availableMethodsFor({ country: "FR" })).toEqual([]);
  });

  it("keeps bank provider and receiving-account filters as separate gates", () => {
    const registry = new PaymentProviderRegistry().register(
      new BankTransferProvider({
        accounts: [
          {
            id: "ng",
            fields: [{ key: "bank", label: "Bank", value: "Nigeria" }],
            filters: { countries: ["NG"] },
          },
          {
            id: "global",
            fields: [{ key: "bank", label: "Bank", value: "Global" }],
            filters: { countries: null },
          },
        ],
      }),
      { filters: { countries: ["NG"] } },
    );

    expect(
      registry
        .availableMethodsFor({ country: "NG" })[0]
        .provider.fundingOptions?.({ country: "NG" })
        .map((option) => option.id),
    ).toEqual(["ng", "global"]);
    expect(registry.availableFor(context("US"))).toEqual([]);
  });

  it("does not invoke currency mapping merely to filter provider visibility", () => {
    let mappingCalls = 0;
    const provider = new BankTransferProvider(
      {
        accounts: [
          {
            id: "global",
            fields: [{ key: "bank", label: "Bank", value: "Global" }],
            filters: { countries: null },
          },
        ],
      },
      {
        resolve: () => {
          mappingCalls += 1;
          return "NGN";
        },
      } as never,
    );
    const registry = new PaymentProviderRegistry().register(provider, {
      filters: { countries: ["NG"] },
    });

    expect(registry.availableFor(context("US"))).toEqual([]);
    expect(mappingCalls).toBe(0);
  });

  it("selects each provider's collection currency when none is requested", () => {
    const registry = new PaymentProviderRegistry().register(
      new PaystackProvider({ secretKey: "test", apiBaseUrl: "https://api.paystack.co" }),
      { filters: { countries: ["NG"] } },
    );
    expect(registry.availableMethodsFor({ country: "NG" })).toEqual([
      expect.objectContaining({ collectionCurrency: "NGN" }),
    ]);
  });

  it("exposes selectable payment currencies and rejects provider mismatches", () => {
    const registry = new PaymentProviderRegistry().register(
      new NowPaymentsProvider({
        apiKey: "test",
        apiBaseUrl: "https://api-sandbox.nowpayments.io",
        payCurrencies: ["usdttrc20", "usdterc20"],
      }),
    );
    expect(registry.availableMethodsFor({ country: null })).toEqual([
      expect.objectContaining({
        customerActionLabel: "Create payment",
        paymentCurrencies: expect.arrayContaining([
          expect.objectContaining({ code: "usdttrc20", label: "USDT TRC20" }),
        ]),
      }),
    ]);
    expect(() => registry.paymentCurrency("nowpayments", "btc")).toThrow("does not support");
    const development = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider());
    expect(() => development.paymentCurrency("development", "btc")).toThrow("does not support");
  });

  it("only enables the development provider outside production runtime", () => {
    expect(isDevelopmentProviderEnabled("development")).toBe(true);
    expect(isDevelopmentProviderEnabled("test")).toBe(true);
    expect(isDevelopmentProviderEnabled("production")).toBe(false);
  });

  it("keeps the development provider out of the production registry", () => {
    const production = registerDevelopmentPaymentProvider(
      new PaymentProviderRegistry(),
      "production",
    );
    expect(production.availableMethodsFor({ country: null })).toEqual([]);

    const development = registerDevelopmentPaymentProvider(
      new PaymentProviderRegistry(),
      "development",
    );
    expect(development.availableMethodsFor({ country: null })).toEqual([
      expect.objectContaining({
        provider: expect.objectContaining({ name: "development", environmentOnly: "development" }),
      }),
    ]);
  });
});
