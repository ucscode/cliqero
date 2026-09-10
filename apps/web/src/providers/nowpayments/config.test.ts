import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadNowPaymentsConfiguration } from "./config";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function writeConfig(sandboxCase: string) {
  const directory = mkdtempSync(join(tmpdir(), "cliqero-nowpayments-config-"));
  directories.push(directory);
  const path = join(directory, "nowpayments.yaml");
  writeFileSync(
    path,
    `enabled: true\nconfig:\n  api_key: test-key\n  api_base_url: https://api-sandbox.nowpayments.io\n  pay_currency: usdttrc20\n  sandbox_case: ${sandboxCase}\n`,
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
});
