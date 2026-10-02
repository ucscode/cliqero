import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";

export type FeeOperation = "withdrawal" | "funding_to_earning" | "earning_to_funding";
export type FeeRule = {
  enabled: boolean;
  basisPoints: bigint;
  maximumMinor: bigint | null;
};
export type FeePolicy = { enabled: boolean } & Record<FeeOperation, FeeRule>;
export interface FeePolicySource {
  getActive(): FeePolicy;
}

const feeSchema = z
  .object({
    enabled: z.boolean(),
    percentage: z
      .number()
      .finite()
      .min(0)
      .max(100)
      .refine((value) => {
        const text = String(value);
        return /^\d+(?:\.\d{1,2})?$/.test(text);
      }, "must have at most two decimal places"),
    maximum_amount_minor: z.number().int().nonnegative().safe().nullable(),
  })
  .strict();

const policySchema = z
  .object({
    enabled: z.boolean(),
    withdrawal: feeSchema,
    funding_to_earning: feeSchema,
    earning_to_funding: feeSchema,
  })
  .strict();

export function feePolicyFromYaml(value: unknown): FeePolicy {
  const parsed = policySchema.parse(value);
  const rule = (fee: (typeof parsed)[FeeOperation]): FeeRule => ({
    enabled: fee.enabled,
    basisPoints: BigInt(Math.round(fee.percentage * 100)),
    maximumMinor: fee.maximum_amount_minor === null ? null : BigInt(fee.maximum_amount_minor),
  });
  return {
    enabled: parsed.enabled,
    withdrawal: rule(parsed.withdrawal),
    funding_to_earning: rule(parsed.funding_to_earning),
    earning_to_funding: rule(parsed.earning_to_funding),
  };
}

/** Fees use exact BigInt minor units and round half up to the nearest cent. */
export function calculateFee(grossMinor: bigint, policy: FeePolicy, operation: FeeOperation) {
  if (grossMinor < 0n) throw new RangeError("Gross amount cannot be negative.");
  const rule = policy[operation];
  if (!policy.enabled || !rule.enabled) return { grossMinor, feeMinor: 0n, netMinor: grossMinor };
  const percentageFee = (grossMinor * rule.basisPoints + 5_000n) / 10_000n;
  const cappedFee =
    rule.maximumMinor === null || percentageFee < rule.maximumMinor
      ? percentageFee
      : rule.maximumMinor;
  const feeMinor = cappedFee > grossMinor ? grossMinor : cappedFee;
  return { grossMinor, feeMinor, netMinor: grossMinor - feeMinor };
}

export class FeePolicyLoader implements FeePolicySource {
  static readonly defaultPath = "config/modules/fee/policy.yaml";
  constructor(private readonly path = FeePolicyLoader.defaultPath) {}

  getActive() {
    return feePolicyFromYaml(loadYamlConfiguration(this.path, process.env, { required: true }));
  }
}
