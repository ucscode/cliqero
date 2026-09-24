import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { WithdrawalMethodRegistry } from "@/modules/withdrawal/methods/registry";

const bank = {
  id: "bank_ng",
  enabled: true,
  display_name: "Bank account",
  description: "Nigerian bank account",
  filters: { countries: ["NG"] },
  fields: [
    {
      name: "account_number",
      label: "Account number",
      type: "text",
      required: true,
      regex: "[0-9]{10}",
      copyable: true,
    },
    {
      name: "network",
      label: "Network",
      type: "fixed",
      value: "TRC20",
      copyable: true,
    },
  ],
};
const global = { ...bank, id: "usdt_trc20", filters: { countries: null } };

describe("WithdrawalMethodRegistry", () => {
  it("validates definitions, unique IDs and field names", () => {
    expect(
      () => new WithdrawalMethodRegistry({ methods: [{ ...bank, image_url: "/bank.svg" }] }),
    ).toThrow();
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
              fields: [{ name: "network", label: "Network", type: "fixed" }],
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
          methods: [{ ...bank, fields: [{ ...bank.fields[0], regex: "(" }] }],
        }),
    ).toThrow("regular expression");
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

  it("enriches trusted metadata and enforces regex server-side", () => {
    const registry = new WithdrawalMethodRegistry({ methods: [bank] });
    const method = registry.requireAvailable("bank_ng", { country: "NG" });
    expect(registry.enrich(method, { account_number: "0123456789" })).toEqual([
      {
        name: "account_number",
        label: "Account number",
        value: "0123456789",
        type: "text",
        copyable: true,
      },
      {
        name: "network",
        label: "Network",
        value: "TRC20",
        type: "fixed",
        copyable: true,
      },
    ]);
    expect(() => registry.enrich(method, { network: "FAKE" })).toThrow("non-editable");
    expect(() => registry.enrich(method, { extra: "x" })).toThrow("Unknown");
    expect(() => registry.enrich(method, { account_number: "123" })).toThrow("invalid format");
  });

  it("supports ordered select options and enum-constrained editable values", () => {
    const method = {
      ...global,
      id: "structured",
      fields: [
        {
          name: "bank",
          label: "Bank",
          type: "select",
          required: true,
          copyable: true,
          options: [
            { key: "uba", label: "United Bank for Africa" },
            { key: "gtbank", label: "Guaranty Trust Bank" },
          ],
        },
        {
          name: "note",
          label: "Note",
          type: "textarea",
          required: true,
          regex: "[a-z]+",
          enum: ["personal", "business"],
          attrs: { rows: 4 },
        },
      ],
    };
    const registry = new WithdrawalMethodRegistry({ methods: [method] });
    const configured = registry.requireAvailable("structured", { country: null });

    expect(registry.enrich(configured, { bank: "uba", note: "personal" })).toEqual([
      {
        name: "bank",
        label: "Bank",
        value: "uba",
        displayValue: "United Bank for Africa",
        type: "select",
        copyable: true,
      },
      {
        name: "note",
        label: "Note",
        value: "personal",
        type: "textarea",
        copyable: false,
      },
    ]);
    expect(() => registry.enrich(configured, { bank: "unknown", note: "personal" })).toThrow(
      "invalid value",
    );
    expect(() => registry.enrich(configured, { bank: "uba", note: "other" })).toThrow(
      "invalid value",
    );
  });

  it("keeps attrs extensible without allowing them to override field semantics", () => {
    const registry = new WithdrawalMethodRegistry({
      methods: [
        {
          ...global,
          id: "attrs",
          fields: [
            {
              name: "account",
              label: "Account",
              type: "text",
              required: true,
              attrs: {
                placeholder: "Account number",
                rows: 4,
                "data-purpose": "withdrawal",
                name: "spoofed",
                type: "email",
                required: false,
                pattern: ".*",
                onClick: "not-processed",
              },
            },
          ],
        },
      ],
    });

    expect(registry.find("attrs")?.fields[0]).toMatchObject({
      name: "account",
      attrs: {
        placeholder: "Account number",
        rows: 4,
        "data-purpose": "withdrawal",
      },
    });
  });

  it("loads imported definitions through the shared YAML composition loader", () => {
    const path = resolve(process.cwd(), "tests/fixtures/withdrawal/methods.yaml");
    const registry = WithdrawalMethodRegistry.load(path);
    expect(registry.listForAccount({ country: "NG" }).map((method) => method.id)).toEqual([
      "fixture_bank",
    ]);
  });

  it("loads the commented bank and USDT example methods from the standard configuration path", () => {
    const path = resolve(process.cwd(), "../../config/modules/withdrawal/methods.example.yaml");
    const registry = WithdrawalMethodRegistry.load(path);
    expect(registry.listForAccount({ country: "NG" }).map((method) => method.id)).toEqual([
      "bank_ng",
      "usdt_trc20",
    ]);
    expect(registry.find("usdt_trc20")?.fields[1]).toMatchObject({
      name: "network",
      type: "fixed",
      value: "TRC20",
      copyable: true,
    });
  });
});
