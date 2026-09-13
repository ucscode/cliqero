import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadNowPaymentsConfiguration } from "./config";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function writeConfig(sandboxCase: string, currencies = "usdttrc20", callback = "", extra = "") {
  const directory = mkdtempSync(join(tmpdir(), "cliqero-nowpayments-config-"));
  directories.push(directory);
  const path = join(directory, "nowpayments.yaml");
  const paymentCurrencies = currencies
    .split(",")
    .map((currency) => `    - ${currency.trim()}`)
    .join("\n");
  writeFileSync(
    path,
    `enabled: true\ndisplay_name: NOWPayments\nimage_url: /images/payment/nowpayments.svg\ndescription: Pay through NOWPayments.\nconfig:\n  api_key: test-key\n  api_base_url: https://api-sandbox.nowpayments.io\n  ${callback ? `ipn_callback_url: ${callback}\n  ` : ""}pay_currencies:\n${paymentCurrencies}\n  ${extra}sandbox_case: ${sandboxCase}\n`,
  );
  return path;
}

describe("NOWPayments configuration", () => {
  it("accepts the documented sandbox success case", () => {
    expect(loadNowPaymentsConfiguration(writeConfig("success"))?.provider.sandboxCase).toBe(
      "success",
    );
  });

  it("rejects an undocumented sandbox case", () => {
    expect(() => loadNowPaymentsConfiguration(writeConfig("unknown"))).toThrow();
  });

  it("documents the sandbox case without enabling it in the example", () => {
    const example = readFileSync(
      join(process.cwd(), "../../config/modules/payment/nowpayments.example.yaml"),
      "utf8",
    );
    expect(example).toContain("# sandbox_case: success");
    expect(example).not.toMatch(/^  sandbox_case: success$/m);
  });

  it("normalizes and preserves the configured payment currency allowlist", () => {
    const result = loadNowPaymentsConfiguration(writeConfig("success", "usdttrc20,usdterc20"));
    expect(result?.provider.payCurrencies).toEqual(["usdttrc20", "usdterc20"]);
  });

  it("rejects the removed singular configured pay_currency", () => {
    expect(() =>
      loadNowPaymentsConfiguration(
        writeConfig("success", "usdttrc20", "", "pay_currency: btc\n  "),
      ),
    ).toThrow();
  });

  it("resolves and normalizes a tunnel-backed IPN callback", () => {
    const result = loadNowPaymentsConfiguration(
      writeConfig("success", "usdttrc20", '"%env(TUNNEL_URL)%/api/payments/nowpayments/ipn"'),
      { TUNNEL_URL: "https://tunnel.example/" },
    );
    expect(result?.provider.ipnCallbackUrl).toBe(
      "https://tunnel.example/api/payments/nowpayments/ipn",
    );
  });

  it("reports a missing tunnel variable for an enabled callback configuration", () => {
    expect(() =>
      loadNowPaymentsConfiguration(
        writeConfig("success", "usdttrc20", '"%env(TUNNEL_URL)%/api/payments/nowpayments/ipn"'),
        {},
      ),
    ).toThrow('Missing environment variable "TUNNEL_URL"');
  });

  it("leaves a static callback URL unchanged", () => {
    const result = loadNowPaymentsConfiguration(
      writeConfig("success", "usdttrc20", "https://example.test/api/ipn"),
    );
    expect(result?.provider.ipnCallbackUrl).toBe("https://example.test/api/ipn");
  });
});
