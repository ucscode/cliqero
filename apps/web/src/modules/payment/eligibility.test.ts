import { describe, expect, it } from "vitest";
import { DevelopmentPaymentProvider, PaymentProviderRegistry } from "./payment";
import { PaystackProvider } from "@/providers/paystack/payment/provider";
import { NowPaymentsProvider } from "@/providers/nowpayments/provider";
import { BankTransferProvider } from "@/providers/bank-transfer/provider";
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
        new NowPaymentsProvider(
          { ...now, payCurrency: "usdterc20", network: "ERC20" },
          "usdt_erc20",
        ),
      )
      .register(
        new NowPaymentsProvider(
          { ...now, payCurrency: "usdttrc20", network: "TRC20" },
          "usdt_trc20",
        ),
      )
      .register(
        new BankTransferProvider({ bankName: "Bank", accountName: "Cliqero", accountNumber: "1" }),
        {
          filters: { countries: null, currencies: ["USD"] },
        },
      );
    expect(registry.availableFor(context(null, "USD")).map((provider) => provider.name)).toEqual([
      "nowpayments",
      "usdt_erc20",
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
});
