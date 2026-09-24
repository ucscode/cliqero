import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { WithdrawalMethodRegistry } from "@/modules/withdrawal/methods/registry";

const bank = {
  id: "bank_ng",
  enabled: true,
  display_name: "Bank account",
  image_url: "/bank.svg",
  description: "Nigerian bank account",
  filters: { countries: ["NG"] },
  fields: [
    {
      key: "account_number",
      label: "Account number",
      type: "text",
      required: true,
      pattern: "^[0-9]{10}$",
      copyable: true,
    },
    { key: "network", label: "Network", type: "fixed", value: "TRC20", copyable: true },
  ],
};
const global = { ...bank, id: "usdt_trc20", filters: { countries: null } };

describe("WithdrawalMethodRegistry", () => {
  it("validates definitions, unique IDs and field keys", () => {
    expect(() => new WithdrawalMethodRegistry({ methods: [bank, bank] })).toThrow("unique");
    expect(
      () =>
        new WithdrawalMethodRegistry({ methods: [{ ...bank, filters: { countries: ["ZZ"] } }] }),
    ).toThrow();
    expect(
      () =>
        new WithdrawalMethodRegistry({
          methods: [{ ...bank, fields: [bank.fields[0], bank.fields[0]] }],
        }),
    ).toThrow("unique");
    expect(
      () =>
        new WithdrawalMethodRegistry({
          methods: [
            {
              ...bank,
              fields: [{ key: "network", label: "Network", type: "fixed", copyable: true }],
            },
          ],
        }),
    ).toThrow();
    expect(
      () => new WithdrawalMethodRegistry({ methods: [bank], provider: "not-allowed" }),
    ).toThrow();
    expect(
      () =>
        new WithdrawalMethodRegistry({
          methods: [{ ...bank, fields: [{ ...bank.fields[0], pattern: "[0-9]+" }] }],
        }),
    ).toThrow("anchored");
  });

  it("applies enabled and country eligibility without inferring country", () => {
    const registry = new WithdrawalMethodRegistry({
      methods: [bank, global, { ...bank, id: "disabled", enabled: false }],
    });
    expect(registry.listForAccount({ country: "NG" }).map((method) => method.id)).toEqual([
      "bank_ng",
      "usdt_trc20",
    ]);
    expect(registry.listForAccount({ country: "US" }).map((method) => method.id)).toEqual([
      "usdt_trc20",
    ]);
    expect(registry.listForAccount({ country: null }).map((method) => method.id)).toEqual([
      "usdt_trc20",
    ]);
  });

  it("enriches client values using ordered trusted config and rejects fixed/unknown values", () => {
    const registry = new WithdrawalMethodRegistry({ methods: [bank] });
    const method = registry.requireAvailable("bank_ng", { country: "NG" });
    expect(registry.enrich(method, { account_number: "0123456789" })).toEqual([
      {
        key: "account_number",
        label: "Account number",
        value: "0123456789",
        type: "text",
        copyable: true,
      },
      { key: "network", label: "Network", value: "TRC20", type: "fixed", copyable: true },
    ]);
    expect(() => registry.enrich(method, { network: "FAKE" })).toThrow("non-editable");
    expect(() => registry.enrich(method, { extra: "x" })).toThrow("Unknown");
    expect(() => registry.enrich(method, { account_number: "123" })).toThrow("invalid format");
  });

  it("loads imported definitions through the shared YAML composition loader", () => {
    const path = resolve(process.cwd(), "tests/fixtures/withdrawal/methods.yaml");
    const registry = WithdrawalMethodRegistry.load(path);
    expect(registry.listForAccount({ country: "NG" }).map((method) => method.id)).toEqual([
      "fixture_bank",
    ]);
  });

  it("loads the tracked bank and USDT example methods from the standard configuration path", () => {
    const path = resolve(process.cwd(), "../../config/modules/withdrawal/methods.example.yaml");
    const registry = WithdrawalMethodRegistry.load(path);
    expect(registry.listForAccount({ country: "NG" }).map((method) => method.id)).toEqual([
      "bank_ng",
      "usdt_trc20",
    ]);
    expect(registry.find("usdt_trc20")?.fields[1]).toMatchObject({
      key: "network",
      type: "fixed",
      value: "TRC20",
    });
  });
});
