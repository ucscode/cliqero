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
config:
  accounts:
    - id: custom
      filters:
        countries: [NG]
        currencies: [USD]
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
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
