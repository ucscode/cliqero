import { describe, expect, it } from "vitest";
import { calculateFee, feePolicyFromYaml, type FeeOperation } from "@/modules/fee/policy";

const operations: FeeOperation[] = ["withdrawal", "funding_to_earning", "earning_to_funding"];
function policy(globalEnabled = true, disabled: FeeOperation[] = []) {
  return feePolicyFromYaml({
    enabled: globalEnabled,
    withdrawal: {
      enabled: !disabled.includes("withdrawal"),
      percentage: 5,
      maximum_amount_minor: 2000,
    },
    funding_to_earning: {
      enabled: !disabled.includes("funding_to_earning"),
      percentage: 2,
      maximum_amount_minor: 1000,
    },
    earning_to_funding: {
      enabled: !disabled.includes("earning_to_funding"),
      percentage: 1,
      maximum_amount_minor: 500,
    },
  });
}

describe("central fee policy", () => {
  it.each(operations)("applies global and operation switches independently for %s", (operation) => {
    const enabled = policy();
    const disabledOperation = policy(true, [operation]);
    const disabledGlobally = policy(false);
    expect(disabledOperation[operation]).toMatchObject({
      enabled: false,
      basisPoints: expect.anything(),
    });
    expect(calculateFee(10_000n, enabled, operation).feeMinor).toBeGreaterThan(0n);
    expect(calculateFee(10_000n, disabledOperation, operation)).toEqual({
      grossMinor: 10_000n,
      feeMinor: 0n,
      netMinor: 10_000n,
    });
    expect(calculateFee(10_000n, disabledGlobally, operation)).toEqual({
      grossMinor: 10_000n,
      feeMinor: 0n,
      netMinor: 10_000n,
    });
  });

  it("calculates exact percentage fees and rounds half up", () => {
    const parsed = feePolicyFromYaml({
      ...{
        enabled: true,
        withdrawal: { enabled: true, percentage: 2.5, maximum_amount_minor: null },
        funding_to_earning: { enabled: true, percentage: 2.5, maximum_amount_minor: null },
        earning_to_funding: { enabled: true, percentage: 2.5, maximum_amount_minor: null },
      },
    });
    expect(calculateFee(10_000n, parsed, "withdrawal")).toEqual({
      grossMinor: 10_000n,
      feeMinor: 250n,
      netMinor: 9_750n,
    });
    expect(
      calculateFee(
        1n,
        feePolicyFromYaml({
          enabled: true,
          withdrawal: { enabled: true, percentage: 50, maximum_amount_minor: null },
          funding_to_earning: { enabled: true, percentage: 50, maximum_amount_minor: null },
          earning_to_funding: { enabled: true, percentage: 50, maximum_amount_minor: null },
        }),
        "withdrawal",
      ),
    ).toMatchObject({ feeMinor: 1n, netMinor: 0n });
  });

  it("keeps percentage caps and malformed booleans are rejected", () => {
    const capped = policy();
    expect(calculateFee(1_000n, capped, "withdrawal").feeMinor).toBe(50n);
    expect(calculateFee(40_000n, capped, "withdrawal").feeMinor).toBe(2_000n);
    expect(calculateFee(50_000n, capped, "withdrawal").feeMinor).toBe(2_000n);
    expect(() =>
      feePolicyFromYaml({
        enabled: true,
        withdrawal: { enabled: true, percentage: -1, maximum_amount_minor: null },
        funding_to_earning: { enabled: true, percentage: 1, maximum_amount_minor: null },
        earning_to_funding: { enabled: true, percentage: 1, maximum_amount_minor: null },
      }),
    ).toThrow();
    expect(() =>
      feePolicyFromYaml({
        enabled: true,
        withdrawal: { enabled: true, percentage: 2.555, maximum_amount_minor: null },
        funding_to_earning: { enabled: true, percentage: 1, maximum_amount_minor: null },
        earning_to_funding: { enabled: true, percentage: 1, maximum_amount_minor: null },
      }),
    ).toThrow();
    expect(() =>
      feePolicyFromYaml({
        enabled: true,
        withdrawal: { enabled: true, percentage: 1, maximum_amount_minor: -1 },
        funding_to_earning: { enabled: true, percentage: 1, maximum_amount_minor: null },
        earning_to_funding: { enabled: true, percentage: 1, maximum_amount_minor: null },
      }),
    ).toThrow();
    expect(
      calculateFee(
        1n,
        feePolicyFromYaml({
          enabled: true,
          withdrawal: { enabled: true, percentage: 100, maximum_amount_minor: null },
          funding_to_earning: { enabled: true, percentage: 0, maximum_amount_minor: null },
          earning_to_funding: { enabled: true, percentage: 0, maximum_amount_minor: null },
        }),
        "withdrawal",
      ).feeMinor,
    ).toBe(1n);
    expect(() =>
      feePolicyFromYaml({
        enabled: "false",
        withdrawal: { enabled: true, percentage: 1, maximum_amount_minor: null },
        funding_to_earning: { enabled: true, percentage: 1, maximum_amount_minor: null },
        earning_to_funding: { enabled: true, percentage: 1, maximum_amount_minor: null },
      }),
    ).toThrow();
    expect(() =>
      feePolicyFromYaml({
        enabled: true,
        withdrawal: { enabled: "false", percentage: 1, maximum_amount_minor: null },
        funding_to_earning: { enabled: true, percentage: 1, maximum_amount_minor: null },
        earning_to_funding: { enabled: true, percentage: 1, maximum_amount_minor: null },
      }),
    ).toThrow();
  });
});
