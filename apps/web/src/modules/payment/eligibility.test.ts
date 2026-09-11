import { describe, expect, it } from "vitest";
import {
  DevelopmentPaymentProvider,
  isDevelopmentProviderEnabled,
  PaymentProviderRegistry,
} from "./payment";
import { PaystackProvider } from "@/providers/paystack/payment/provider";
import { NowPaymentsProvider } from "@/providers/nowpayments/provider";
import { BankTransferProvider } from "@/providers/bank-transfer/provider";
import { DirectTrc20Provider } from "@/providers/direct-trc20/provider";
import type { DirectTrc20Verifier } from "@/providers/direct-trc20/verifier";
const context = (country: string | null, currency: string) => ({ country, currency });
describe("payment provider eligibility", () => {
  it("applies enabled country and currency filters", () => {
    const registry = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider(), {
      enabled: true,
      filters: { countries: ["NG"], currencies: ["NGN"] },
    });
    expect(registry.availableFor(context("NG", "NGN"))).toHaveLength(1);
    expect(registry.availableFor(context("GH", "NGN"))).toHaveLength(0);
    expect(registry.availableFor(context("NG", "USD"))).toHaveLength(0);
  });
  it("evaluates Paystack filters against collection currency", () => {
    const registry = new PaymentProviderRegistry().register(
      new PaystackProvider({ secretKey: "test", apiBaseUrl: "https://api.paystack.co" }),
      { filters: { countries: ["NG"], currencies: ["NGN"] } },
    );
    expect(registry.collectionCurrency("paystack")).toBe("NGN");
    expect(registry.availableFor(context("NG", "NGN"))).toHaveLength(1);
  });
  it("treats null filters as unrestricted and disabled providers as unavailable", () => {
    const registry = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider(), {
      enabled: false,
      filters: { countries: null, currencies: null },
    });
    expect(registry.availableFor(context(null, "USD"))).toHaveLength(0);
    const open = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider(), {
      filters: { countries: null, currencies: null },
    });
    expect(open.availableFor(context(null, "USD"))).toHaveLength(1);
  });
  it("rejects a manually selected ineligible provider", () => {
    const registry = new PaymentProviderRegistry().register(new DevelopmentPaymentProvider(), {
      filters: { countries: ["NG"], currencies: null },
    });
    expect(() => registry.get("development", context("GH", "USD"))).toThrow("unavailable");
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
              filters: { countries: null, currencies: ["USD"] },
            },
          ],
        }),
        {
          filters: { countries: null, currencies: ["USD"] },
        },
      );
    expect(registry.availableFor(context(null, "USD")).map((provider) => provider.name)).toEqual([
      "nowpayments",
      "usdt_trc20",
      "bank_transfer",
    ]);
  });

  it("selects each provider's configured collection currency when none is requested", () => {
    const registry = new PaymentProviderRegistry().register(
      new PaystackProvider({ secretKey: "test", apiBaseUrl: "https://api.paystack.co" }),
      { filters: { countries: ["NG"], currencies: ["NGN"] } },
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
});
