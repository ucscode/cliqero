import { describe, expect, it } from "vitest";
import { commissionPolicyFromYaml, loadYamlCommissionPolicy } from "@/modules/referral/yaml-policy";

describe("YAML commission policy", () => {
  it("loads sparse unordered percentage levels and a platform percentage", () => {
    const p = commissionPolicyFromYaml({
      distribution: {
        platform: { percentage: 10 },
        commission: { levels: { 9: 12, 1: 10, 3: 5 } },
      },
    });
    expect(p.levels).toEqual([
      { level: 1, rateBasisPoints: 1000 },
      { level: 3, rateBasisPoints: 500 },
      { level: 9, rateBasisPoints: 1200 },
    ]);
    expect(p.platformRateBasisPoints).toBe(1000);
    expect(p.maximumRewardedDepth).toBe(9);
  });

  it("rejects invalid levels and a combined allocation above 100%", () => {
    expect(() =>
      commissionPolicyFromYaml({
        distribution: { platform: { percentage: 10 }, commission: { levels: { 0: 20 } } },
      }),
    ).toThrow();
    expect(() =>
      commissionPolicyFromYaml({
        distribution: { platform: { percentage: 10 }, commission: { levels: { "-1": 20 } } },
      }),
    ).toThrow();
    expect(() =>
      commissionPolicyFromYaml({
        distribution: { platform: { percentage: 51 }, commission: { levels: { 1: 50 } } },
      }),
    ).toThrow();
  });

  it("accepts an explicit empty schedule as a deliberate no-commission policy", () => {
    const p = commissionPolicyFromYaml({
      distribution: { platform: { percentage: 10 }, commission: { levels: {} } },
    });
    expect(p.levels).toEqual([]);
    expect(p.maximumRewardedDepth).toBe(0);
    expect(p.platformRateBasisPoints).toBe(1000);
  });

  it("does not impose an artificial hierarchy depth ceiling", () => {
    const levels = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [index + 1, 1]));
    expect(
      commissionPolicyFromYaml({
        distribution: { platform: { percentage: 0 }, commission: { levels } },
      }).maximumRewardedDepth,
    ).toBe(33);
  });

  it("requires the runtime policy file instead of falling back to an example", () =>
    expect(() => loadYamlCommissionPolicy("config/does-not-exist.yaml")).toThrow(
      "Required configuration file is missing",
    ));

  it("loads distribution policy from the enveloped example", () => {
    expect(loadYamlCommissionPolicy("config/hierarchy/distribution.example.yaml")).toMatchObject({
      platformRateBasisPoints: 1000,
      maximumRewardedDepth: 3,
    });
  });

  it("normalizes explicit null levels to no referral allocation", () =>
    expect(
      commissionPolicyFromYaml({
        distribution: { platform: { percentage: 10 }, commission: { levels: null } },
      }).maximumRewardedDepth,
    ).toBe(0));

  it("requires the platform percentage and commission mapping", () => {
    expect(() => commissionPolicyFromYaml({})).toThrow(/distribution/);
    expect(() => commissionPolicyFromYaml({ distribution: {} })).toThrow(/platform/);
    expect(() =>
      commissionPolicyFromYaml({ distribution: { platform: { percentage: 10 } } }),
    ).toThrow(/commission/);
    expect(() =>
      commissionPolicyFromYaml({
        distribution: { platform: { percentage: 10 }, commission: {} },
      }),
    ).toThrow(/levels/);
  });
});
