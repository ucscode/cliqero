import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPaystackConfiguration } from "@/providers/payment/paystack/config";
import { configurationEnvelope } from "../../../config/yaml-fixture";

function configText(currencies: string, defaultCurrency: string) {
  return configurationEnvelope(`enabled: true
display_name: Paystack
image_url: /images/payment/paystack.svg
description: Pay with Paystack.
config:
  public_key: pk_test_example
  secret_key: sk_test_example
  callback_url: "%env(APP_URL)%/payments/paystack/callback"
  currencies: [${currencies}]
  default_currency: ${defaultCurrency}
filters:
  countries: [NG, GH]
`);
}

describe("Paystack configuration", () => {
  it("loads provider-owned currencies and resolves the callback from APP_URL", () => {
    const directory = mkdtempSync(join(tmpdir(), "cliqero-paystack-config-"));
    const path = join(directory, "paystack.yaml");
    writeFileSync(path, configText("ngn, usd", "usd"));
    try {
      const loaded = loadPaystackConfiguration(path, { APP_URL: "http://localhost:3000" });
      expect(loaded?.provider).toMatchObject({
        apiBaseUrl: "https://api.paystack.co",
        callbackUrl: "http://localhost:3000/payments/paystack/callback",
        currencies: ["NGN", "USD"],
        defaultCurrency: "USD",
      });
      expect(loaded?.filters).toEqual({ countries: ["NG", "GH"] });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a default currency outside the configured capability", () => {
    const directory = mkdtempSync(join(tmpdir(), "cliqero-paystack-config-"));
    const path = join(directory, "paystack.yaml");
    writeFileSync(path, configText("NGN", "USD"));
    try {
      expect(() => loadPaystackConfiguration(path, { APP_URL: "http://localhost:3000" })).toThrow(
        "default_currency must be included",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
