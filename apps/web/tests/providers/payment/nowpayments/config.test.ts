import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadNowPaymentsConfiguration } from "@/providers/payment/nowpayments/config";
import { configurationEnvelope } from "../../../config/yaml-fixture";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function writeConfig(
  sandbox = "  sandbox:\n    case: success",
  currencies = "usdttrc20",
  callback = "",
  apiBaseUrl = "https://api-sandbox.nowpayments.io",
  extra = "",
) {
  const directory = mkdtempSync(join(tmpdir(), "cliqero-nowpayments-config-"));
  directories.push(directory);
  const path = join(directory, "nowpayments.yaml");
  const paymentCurrencies = currencies
    .split(",")
    .map((currency) => `    - ${currency.trim()}`)
    .join("\n");
  writeFileSync(
    path,
    configurationEnvelope(
      `enabled: true\ndisplay_name: NOWPayments\nimage_url: /images/payment/nowpayments.svg\ndescription: Pay through NOWPayments.\nconfig:\n  api_key: test-key\n  api_base_url: ${apiBaseUrl}\n  ${callback ? `ipn_callback_url: ${callback}\n  ` : ""}pay_currencies:\n${paymentCurrencies}\n${extra}${sandbox}\n`,
    ),
  );
  return path;
}

describe("NOWPayments configuration", () => {
  it.each([
    ["omitted", ""],
    ["null", "  sandbox: null"],
    ["configured", "  sandbox:\n    case: success"],
  ])("accepts sandbox configuration when %s", (mode, sandbox) => {
    const result = loadNowPaymentsConfiguration(writeConfig(sandbox));
    expect(result?.provider.sandbox).toEqual(
      mode === "configured" ? { case: "success" } : undefined,
    );
  });

  it("rejects an undocumented sandbox case", () => {
    expect(() =>
      loadNowPaymentsConfiguration(writeConfig("  sandbox:\n    case: unknown")),
    ).toThrow();
  });

  it("rejects the removed flat sandbox_case setting", () => {
    expect(() => loadNowPaymentsConfiguration(writeConfig("  sandbox_case: success"))).toThrow(
      /Unrecognized key.*sandbox_case/,
    );
  });

  it("rejects the removed sandbox.enabled shape", () => {
    expect(() =>
      loadNowPaymentsConfiguration(writeConfig("  sandbox:\n    enabled: true\n    case: success")),
    ).toThrow(/enabled/);
  });

  it("rejects sandbox simulation against the production API", () => {
    expect(() =>
      loadNowPaymentsConfiguration(
        writeConfig("  sandbox:\n    case: success", "usdttrc20", "", "https://api.nowpayments.io"),
      ),
    ).toThrow("NOWPayments sandbox.case requires api_base_url=https://api-sandbox.nowpayments.io");
  });

  it("documents the sandbox case without enabling it in the example", () => {
    const example = readFileSync(
      join(process.cwd(), "../../config/modules/payment/nowpayments.example.yaml"),
      "utf8",
    );
    expect(example).toContain("# sandbox:");
    expect(example).toContain("#   case: success");
    expect(example).not.toMatch(/^  sandbox:$/m);
  });

  it("normalizes and preserves the configured payment currency allowlist", () => {
    const result = loadNowPaymentsConfiguration(writeConfig(undefined, "usdttrc20,usdterc20"));
    expect(result?.provider.payCurrencies).toEqual(["usdttrc20", "usdterc20"]);
  });

  it("rejects the removed singular configured pay_currency", () => {
    expect(() =>
      loadNowPaymentsConfiguration(
        writeConfig(
          undefined,
          "usdttrc20",
          "",
          "https://api-sandbox.nowpayments.io",
          "pay_currency: btc\n  ",
        ),
      ),
    ).toThrow();
  });

  it("resolves and normalizes a tunnel-backed IPN callback", () => {
    const result = loadNowPaymentsConfiguration(
      writeConfig(undefined, "usdttrc20", '"%env(TUNNEL_URL)%/api/payments/nowpayments/ipn"'),
      { TUNNEL_URL: "https://tunnel.example/" },
    );
    expect(result?.provider.ipnCallbackUrl).toBe(
      "https://tunnel.example/api/payments/nowpayments/ipn",
    );
  });

  it("reports a missing tunnel variable for an enabled callback configuration", () => {
    expect(() =>
      loadNowPaymentsConfiguration(
        writeConfig(undefined, "usdttrc20", '"%env(TUNNEL_URL)%/api/payments/nowpayments/ipn"'),
        {},
      ),
    ).toThrow('Missing environment variable "TUNNEL_URL"');
  });

  it("leaves a static callback URL unchanged", () => {
    const result = loadNowPaymentsConfiguration(
      writeConfig(undefined, "usdttrc20", "https://example.test/api/ipn"),
    );
    expect(result?.provider.ipnCallbackUrl).toBe("https://example.test/api/ipn");
  });
});
