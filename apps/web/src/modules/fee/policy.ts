import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";

export type FeeOperation = "withdrawal" | "funding_to_earning" | "earning_to_funding";
export type FeePolicy = Record<FeeOperation, { basisPoints: bigint; maximumMinor: bigint | null }>;
export interface FeePolicySource {
  getActive(): FeePolicy;
}

const feeSchema = z
  .object({
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
    withdrawal: feeSchema,
    funding_to_earning: feeSchema,
    earning_to_funding: feeSchema,
  })
  .strict();

export function feePolicyFromYaml(value: unknown): FeePolicy {
  const parsed = policySchema.parse(value);
  return Object.fromEntries(
    (Object.keys(parsed) as FeeOperation[]).map((operation) => {
      const fee = parsed[operation];
      return [
        operation,
        {
          basisPoints: BigInt(Math.round(fee.percentage * 100)),
          maximumMinor: fee.maximum_amount_minor === null ? null : BigInt(fee.maximum_amount_minor),
        },
      ];
    }),
  ) as FeePolicy;
}

/** Fees use exact BigInt minor units and round half up to the nearest cent. */
export function calculateFee(grossMinor: bigint, policy: FeePolicy[FeeOperation]) {
  if (grossMinor < 0n) throw new RangeError("Gross amount cannot be negative.");
  const percentageFee = (grossMinor * policy.basisPoints + 5_000n) / 10_000n;
  const cappedFee =
    policy.maximumMinor === null || percentageFee < policy.maximumMinor
      ? percentageFee
      : policy.maximumMinor;
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
