import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";
import type { WithdrawalPolicy, WithdrawalPolicySource } from "@/modules/withdrawal/withdrawal";
import { Money } from "@/modules/money/money";

const policySchema = z
  .object({
    enabled: z.boolean(),
    currency: z.string().regex(/^[A-Z]{3}$/, "must be an uppercase 3-letter currency code"),
    minimum_amount_minor: z.number().int().positive().safe(),
    maximum_amount_minor: z.number().int().positive().safe().nullable(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      policy.maximum_amount_minor !== null &&
      policy.maximum_amount_minor < policy.minimum_amount_minor
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximum_amount_minor"],
        message: "must be greater than or equal to minimum_amount_minor",
      });
    }
  });

export function withdrawalPolicyFromYaml(value: unknown): WithdrawalPolicy {
  const parsed = policySchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "parameters"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid withdrawal policy configuration (${details})`);
  }
  const policy = parsed.data;
  return {
    enabled: policy.enabled,
    minimumAmount: Money.of(BigInt(policy.minimum_amount_minor), policy.currency),
    maximumAmount:
      policy.maximum_amount_minor === null
        ? null
        : Money.of(BigInt(policy.maximum_amount_minor), policy.currency),
  };
}

export class WithdrawalPolicyLoader implements WithdrawalPolicySource {
  static readonly defaultPath = "config/modules/withdrawal/policy.yaml";

  constructor(private readonly path = WithdrawalPolicyLoader.defaultPath) {}

  async getActive(): Promise<WithdrawalPolicy> {
    const value = loadYamlConfiguration(this.path, process.env, { required: true });
    try {
      return withdrawalPolicyFromYaml(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid policy values";
      throw new Error(`Invalid withdrawal policy at ${this.path}: ${message}`, { cause: error });
    }
  }
}
