import { describe, expect, it } from "vitest";
import {
  DevelopmentPaymentProvider,
  isDevelopmentProviderEnabled,
  PaymentProviderRegistry,
  registerDevelopmentPaymentProvider,
} from "./payment";
import { PaystackProvider } from "@/providers/paystack/payment/provider";
import { NowPaymentsProvider } from "@/providers/nowpayments/provider";
import { BankTransferProvider } from "@/providers/bank-transfer/provider";
import { DirectTrc20Provider } from "@/providers/direct-trc20/provider";
import type { DirectTrc20Verifier } from "@/providers/direct-trc20/verifier";
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
    expect(registry.availableFor(context("US"))).toHaveLength(0);
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
      payCurrency: "btc",
    };
    const registry = new PaymentProviderRegistry()
      .register(new NowPaymentsProvider(now, "nowpayments"))
      .register(
        new DirectTrc20Provider(
          {
            walletAddress: "Tabc",
            confirmationsRequired: 6,
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
        payCurrency: "usdttrc20",
        payCurrencies: ["usdttrc20", "usdterc20"],
      }),
    );
    expect(registry.availableMethodsFor({ country: null })).toEqual([
      expect.objectContaining({
        defaultPaymentCurrency: "usdttrc20",
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
