import { describe, expect, it } from "vitest";
import { calculateFee, feePolicyFromYaml } from "@/modules/fee/policy";

const policy = (percentage: number, maximum_amount_minor: number | null = null) =>
  feePolicyFromYaml({
    withdrawal: { percentage, maximum_amount_minor },
    funding_to_earning: { percentage, maximum_amount_minor },
    earning_to_funding: { percentage, maximum_amount_minor },
  }).withdrawal;

describe("central fee policy", () => {
  it("calculates exact percentage fees and rounds half up", () => {
    expect(calculateFee(10_000n, policy(2.5))).toEqual({
      grossMinor: 10_000n,
      feeMinor: 250n,
      netMinor: 9_750n,
    });
    expect(calculateFee(1n, policy(50))).toMatchObject({ feeMinor: 1n, netMinor: 0n });
    expect(calculateFee(1n, policy(49))).toMatchObject({ feeMinor: 0n, netMinor: 1n });
  });

  it("caps fees below, at, and above the configured maximum and never exceeds gross", () => {
    const capped = policy(5, 2_000);
    expect(calculateFee(1_000n, capped).feeMinor).toBe(50n);
    expect(calculateFee(40_000n, capped).feeMinor).toBe(2_000n);
    expect(calculateFee(50_000n, capped).feeMinor).toBe(2_000n);
    expect(calculateFee(1n, policy(100)).feeMinor).toBe(1n);
  });

  it("accepts zero and nullable caps, rejecting invalid percentages and negative caps", () => {
    expect(calculateFee(500n, policy(0)).feeMinor).toBe(0n);
    expect(() => policy(-1)).toThrow();
    expect(() => policy(2.555)).toThrow();
    expect(() => policy(1, -1)).toThrow();
    expect(policy(1, null).maximumMinor).toBeNull();
  });
});
