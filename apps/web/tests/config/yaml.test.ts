import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadYamlConfiguration,
  parseYamlConfiguration,
  resolveEnvironmentPlaceholders,
} from "@/config/yaml";
import { loadNowPaymentsConfiguration } from "@/providers/payment/nowpayments/config";
import { configurationEnvelope as envelope } from "./yaml-fixture";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function configuration(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "cliqero-yaml-config-"));
  roots.push(root);
  writeFiles(root, files);
  return root;
}

function writeFiles(root: string, files: Record<string, string>) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    writeFileSync(path, contents);
  }
}

describe("YAML configuration composition", () => {
  it("unwraps the canonical envelope and normalizes empty values", () => {
    const root = configuration({
      "empty.yaml": "imports:\nparameters:\n",
      "nulls.yaml": "imports: null\nparameters: null\n",
      "arrays.yaml": "imports: []\nparameters: {}\n",
      "named.yaml": envelope("name: Cliqero"),
    });

    expect(parseYamlConfiguration(join(root, "empty.yaml"))).toEqual({});
    expect(parseYamlConfiguration(join(root, "nulls.yaml"))).toEqual({});
    expect(parseYamlConfiguration(join(root, "arrays.yaml"))).toEqual({});
    expect(parseYamlConfiguration(join(root, "named.yaml"))).toEqual({ name: "Cliqero" });
  });

  it.each([
    ["legacy root values", "enabled: true\n"],
    ["unknown envelope key", "imports:\nparameters: {}\nextra: true\n"],
    ["scalar imports", "imports: ./child.yaml\nparameters: {}\n"],
    ["mapping imports", "imports:\n  file: ./child.yaml\nparameters: {}\n"],
    ["scalar parameters", "imports:\nparameters: scalar\n"],
    ["array parameters", "imports:\nparameters:\n  - item\n"],
    ["absolute imports", "imports:\n  - /tmp/child.yaml\nparameters: {}\n"],
    ["non-YAML imports", "imports:\n  - ./child.json\nparameters: {}\n"],
    ["glob imports", "imports:\n  - ./*.yaml\nparameters: {}\n"],
  ])("rejects %s with its source path", (_case, source) => {
    const root = configuration({ "invalid.yaml": source });
    expect(() => parseYamlConfiguration(join(root, "invalid.yaml"))).toThrow(
      join(root, "invalid.yaml"),
    );
  });

  it("resolves imports relative to each declaring file and composes recursively", () => {
    const root = configuration({});
    writeFiles(root, {
      "root.yaml": envelope("root: yes", "\n  - ./parts/child.yaml"),
      "parts/child.yaml": envelope("nested:\n    child: yes", "\n  - ./deep/grandchild.yml"),
      "parts/deep/grandchild.yml": envelope("nested:\n    grandchild: yes"),
    });

    expect(parseYamlConfiguration(join(root, "root.yaml"))).toEqual({
      root: "yes",
      nested: { child: "yes", grandchild: "yes" },
    });
  });

  it("deep-merges mappings, concatenates arrays in order, and applies parent values last", () => {
    const root = configuration({});
    writeFiles(root, {
      "root.yaml": envelope(
        "settings:\n  own: true\n  winner: parent\nitems:\n  - parent\nscalar: parent\nfilters:\n  countries: null",
        "\n  - ./first.yaml\n  - ./second.yaml",
      ),
      "first.yaml": envelope(
        "settings:\n  first: true\n  winner: first\nitems:\n  - first\nscalar: first\nfilters:\n  enabled: true",
      ),
      "second.yaml": envelope(
        "settings:\n  second: true\n  winner: second\nitems:\n  - second\nscalar: second\nfilters:\n  region: global",
      ),
    });

    expect(parseYamlConfiguration(join(root, "root.yaml"))).toEqual({
      settings: { own: true, first: true, second: true, winner: "parent" },
      items: ["first", "second", "parent"],
      scalar: "parent",
      filters: { enabled: true, region: "global", countries: null },
    });
  });

  it("reports a canonical circular import chain", () => {
    const root = configuration({});
    writeFiles(root, {
      "a.yaml": envelope("", "\n  - ./nested/../b.yaml"),
      "b.yaml": envelope("", "\n  - ./c.yaml"),
      "c.yaml": envelope("", "\n  - ./a.yaml"),
    });

    expect(() => parseYamlConfiguration(join(root, "a.yaml"))).toThrow(
      new RegExp(
        `Circular YAML configuration import: .*a\\.yaml -> .*b\\.yaml -> .*c\\.yaml -> .*a\\.yaml`,
      ),
    );
  });

  it("rejects a missing explicit import and identifies the importer and target", () => {
    const root = configuration({ "root.yaml": envelope("", "\n  - ./missing.yaml") });
    expect(() => parseYamlConfiguration(join(root, "root.yaml"))).toThrow(
      `Missing imported YAML configuration "${join(root, "missing.yaml")}" imported by "${join(root, "root.yaml")}"`,
    );
  });

  it("preserves optional and required missing-root behavior", () => {
    expect(loadYamlConfiguration("config/does-not-exist.yaml")).toBeNull();
    expect(() =>
      loadYamlConfiguration("config/does-not-exist.yaml", {}, { required: true }),
    ).toThrow("Required configuration file is missing");
  });

  it("resolves imported environment placeholders only after composition", () => {
    const root = configuration({});
    writeFiles(root, {
      "root.yaml": envelope('url: "%env(APP_URL)%/child"', "\n  - ./part.yaml"),
      "part.yaml": envelope('host: "%env(HOST)%"'),
    });
    expect(
      loadYamlConfiguration(join(root, "root.yaml"), {
        APP_URL: "https://app.test",
        HOST: "cdn.test",
      }),
    ).toEqual({
      url: "https://app.test/child",
      host: "cdn.test",
    });
  });

  it("does not resolve imported secrets to determine a disabled provider is disabled", () => {
    const root = configuration({});
    writeFiles(root, {
      "nowpayments.yaml": envelope(
        'enabled: false\ndisplay_name: NOWPayments\nimage_url: /images/payment/nowpayments.svg\ndescription: Pay with crypto.\nconfig:\n  api_key: "%env(MISSING_NOWPAYMENTS_KEY)%"',
        "\n  - ./secrets.yaml",
      ),
      "secrets.yaml": envelope('config:\n  ipn_secret: "%env(MISSING_NOWPAYMENTS_IPN)%"'),
    });

    expect(loadNowPaymentsConfiguration(join(root, "nowpayments.yaml"), {})).toBeNull();
  });
});

describe("YAML environment placeholders", () => {
  const env = { APP_URL: "https://app.example", HOST: "example.test", PORT: "443" };
  it("resolves embedded and repeated placeholders", () =>
    expect(
      resolveEnvironmentPlaceholders("%env(PROTOCOL)%://%env(HOST)%:%env(PORT)%/x", {
        ...env,
        PROTOCOL: "https",
      }),
    ).toBe("https://example.test:443/x"));
  it("resolves nested objects and arrays", () =>
    expect(
      resolveEnvironmentPlaceholders({ a: ["%env(APP_URL)%/one", { b: "pre-%env(HOST)%" }] }, env),
    ).toEqual({ a: ["https://app.example/one", { b: "pre-example.test" }] }));
  it("leaves ordinary values and supports escaping", () =>
    expect(resolveEnvironmentPlaceholders(["plain", "%%env(APP_URL)%%"], env)).toEqual([
      "plain",
      "%env(APP_URL)%",
    ]));
  it("reports only the missing variable and source path", () =>
    expect(() =>
      resolveEnvironmentPlaceholders(
        "%env(MISSING_SECRET)%",
        { OTHER: "secret-value" },
        "config.yaml",
      ),
    ).toThrow('Missing environment variable "MISSING_SECRET" while resolving config.yaml'));
  it("resolves repository-relative configuration from a nested runtime directory", () => {
    const previous = process.cwd();
    try {
      process.chdir(`${previous}/src`);
      expect(parseYamlConfiguration("config/modules/payment/paystack.example.yaml")).not.toBeNull();
    } finally {
      process.chdir(previous);
    }
  });

  it("parses every tracked Cliqero configuration example through the canonical envelope", () => {
    const examples = [
      "config/hierarchy/distribution.example.yaml",
      "config/hierarchy/visualization.example.yaml",
      "config/modules/email.example.yaml",
      "config/modules/payment/bank_transfer.example.yaml",
      "config/modules/payment/nowpayments.example.yaml",
      "config/modules/payment/paystack.example.yaml",
      "config/modules/payment/usdt_trc20.example.yaml",
      "config/security/auth.example.yaml",
      "config/security/captcha.example.yaml",
      "config/site.example.yaml",
      "config/storage/media.example.yaml",
      "config/storefront.example.yaml",
    ];

    for (const path of examples) {
      expect(parseYamlConfiguration(path), path).toBeTypeOf("object");
    }
  });
});
