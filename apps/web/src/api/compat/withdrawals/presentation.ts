import type { Withdrawal } from "@/modules/withdrawal/withdrawal";

export function presentWithdrawal(withdrawal: Withdrawal) {
  return {
    id: withdrawal.id,
    amount_minor: withdrawal.amount.minorAmount.toString(),
    currency: withdrawal.amount.currency,
    destination: {
      method: withdrawal.destination.method,
      method_name: withdrawal.destination.methodName,
      name: withdrawal.destination.name,
    },
    state: withdrawal.state,
    reason: withdrawal.reason ?? null,
    created_at: withdrawal.createdAt.toISOString(),
    updated_at: withdrawal.updatedAt.toISOString(),
  };
}

export function presentWithdrawalPolicy(policy: {
  enabled: boolean;
  minimumAmount: { minorAmount: bigint; currency: string };
  maximumAmount: { minorAmount: bigint; currency: string } | null;
}) {
  return {
    enabled: policy.enabled,
    minimum_amount_minor: policy.minimumAmount.minorAmount.toString(),
    maximum_amount_minor: policy.maximumAmount?.minorAmount.toString() ?? null,
    currency: policy.minimumAmount.currency,
  };
}
