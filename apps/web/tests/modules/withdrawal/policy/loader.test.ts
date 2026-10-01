import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WithdrawalPolicyLoader,
  withdrawalPolicyFromYaml,
} from "@/modules/withdrawal/policy/loader";

const validPolicy = `parameters:\n  enabled: true\n  minimum_amount_minor: 100\n  maximum_amount_minor: null\n`;

describe("withdrawal YAML policy", () => {
  it("uses the required runtime policy path", () => {
    expect(WithdrawalPolicyLoader.defaultPath).toBe("config/modules/withdrawal/policy.yaml");
  });

  it("loads the tracked policy example through the shared YAML loader", async () => {
    const policy = await new WithdrawalPolicyLoader(
      "config/modules/withdrawal/policy.example.yaml",
    ).getActive();
    expect(policy).toMatchObject({
      enabled: true,
      minimumAmount: { minorAmount: 100n, currency: "USD" },
      maximumAmount: null,
    });
  });

  it("requires enabled and rejects configurable currency because domain money is canonical USD", () => {
    expect(() => withdrawalPolicyFromYaml({ currency: "USD" })).toThrow("enabled");
    expect(() =>
      withdrawalPolicyFromYaml({
        enabled: true,
        currency: "NGN",
        minimum_amount_minor: 1,
        maximum_amount_minor: null,
      }),
    ).toThrow("Unrecognized key");
  });

  it("requires positive integer minor-unit limits and validates their range", () => {
    for (const minimum of [0, -1, 1.2, "100"]) {
      expect(() =>
        withdrawalPolicyFromYaml({
          enabled: true,
          minimum_amount_minor: minimum,
          maximum_amount_minor: null,
        }),
      ).toThrow("minimum_amount_minor");
    }
    for (const maximum of [0, -1, 1.2, "100"]) {
      expect(() =>
        withdrawalPolicyFromYaml({
          enabled: true,
          minimum_amount_minor: 1,
          maximum_amount_minor: maximum,
        }),
      ).toThrow("maximum_amount_minor");
    }
    expect(
      withdrawalPolicyFromYaml({
        enabled: false,
        minimum_amount_minor: 200,
        maximum_amount_minor: null,
      }).maximumAmount,
    ).toBeNull();
    expect(() =>
      withdrawalPolicyFromYaml({
        enabled: true,
        minimum_amount_minor: 200,
        maximum_amount_minor: 199,
      }),
    ).toThrow("greater than or equal");
  });

  it("rejects unknown keys and reports malformed or missing required configuration", async () => {
    expect(() =>
      withdrawalPolicyFromYaml({
        enabled: true,
        minimum_amount_minor: 100,
        maximum_amount_minor: null,
        unexpected: true,
      }),
    ).toThrow("Unrecognized key");
    await expect(
      new WithdrawalPolicyLoader("config/modules/withdrawal/missing-policy.yaml").getActive(),
    ).rejects.toThrow("Required configuration file is missing");

    const directory = mkdtempSync(join(tmpdir(), "cliqero-withdrawal-policy-"));
    const path = join(directory, "policy.yaml");
    try {
      writeFileSync(path, "parameters:\n  enabled: yes\n");
      await expect(new WithdrawalPolicyLoader(path).getActive()).rejects.toThrow(
        "Invalid withdrawal policy at",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reads the configured policy for each call so YAML remains authoritative", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cliqero-withdrawal-policy-live-"));
    const path = join(directory, "policy.yaml");
    try {
      writeFileSync(path, validPolicy);
      const loader = new WithdrawalPolicyLoader(path);
      expect((await loader.getActive()).minimumAmount.minorAmount).toBe(100n);
      writeFileSync(
        path,
        validPolicy.replace("minimum_amount_minor: 100", "minimum_amount_minor: 250"),
      );
      expect((await loader.getActive()).minimumAmount.minorAmount).toBe(250n);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
