import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBankTransferConfiguration } from "./config";

describe("bank transfer configuration", () => {
  it("loads provider accounts from nested config with arbitrary ordered fields", () => {
    const directory = mkdtempSync(join(tmpdir(), "cliqero-bank-config-"));
    const path = join(directory, "bank.yaml");
    writeFileSync(
      path,
      `enabled: true
display_name: Bank transfer
image_url: /images/payment/bank-transfer.svg
description: Transfer funds from your bank account.
config:
  accounts:
    - id: custom
      filters:
        countries: [NG]
      currency_mapping:
        enabled: true
        overrides:
          NG: GBP
      fields:
        - key: wire_routing
          label: Whatever the bank calls this
          value: "123"
        - key: custom_note
          label: Custom note
          value: Send reference
`,
    );
    try {
      const loaded = loadBankTransferConfiguration(path);
      expect(loaded?.provider.accounts[0]).toMatchObject({
        id: "custom",
        fields: [
          { key: "wire_routing", label: "Whatever the bank calls this", value: "123" },
          { key: "custom_note", label: "Custom note", value: "Send reference" },
        ],
      });
      expect(loaded?.provider.accounts[0].currencyMapping).toEqual({
        enabled: true,
        overrides: { NG: "GBP" },
      });
      expect(loaded?.filters).toEqual({ countries: null });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("loads the provider-level country visibility filter separately from accounts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cliqero-bank-config-"));
    const path = join(directory, "bank.yaml");
    writeFileSync(
      path,
      `enabled: true
display_name: Bank transfer
image_url: /images/payment/bank-transfer.svg
description: Transfer funds from your bank account.
filters:
  countries: [NG, US]
config:
  accounts:
    - id: local
      filters:
        countries: [NG]
      fields:
        - key: bank_name
          label: Bank
          value: Example Bank
`,
    );
    try {
      expect(loadBankTransferConfiguration(path)?.filters).toEqual({ countries: ["NG", "US"] });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
