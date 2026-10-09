import type { Withdrawal } from "@/modules/withdrawal/withdrawal";
import type { FeePolicy } from "@/modules/fee/policy";
import type {
  OperatorWithdrawal,
  OperatorWithdrawalDetail,
} from "@/infrastructure/postgres/operator/withdrawals";
import { withdrawalResponseSchema } from "./contracts";

export function presentOwnedWithdrawal(withdrawal: Withdrawal) {
  return {
    ...presentWithdrawal(withdrawal),
    account: null,
    reservation: null,
    external_reference: null,
    completion_note: null,
    completed_by: null,
    completed_at: null,
    payout_return: null,
    payout_initiation: null,
    payout_failure: null,
    attention: null,
    payout_details: null,
  };
}

export function presentOperatorWithdrawal(
  withdrawal: OperatorWithdrawal | OperatorWithdrawalDetail,
) {
  const payoutDetails =
    "fields" in withdrawal.destination
      ? {
          saved_destination_id: withdrawal.destination.savedDestinationId,
          fields: withdrawal.destination.fields.map((field) => ({
            name: field.name,
            label: field.label,
            value: field.value,
            ...(field.displayValue ? { display_value: field.displayValue } : {}),
            type: field.type,
            copyable: field.copyable,
          })),
        }
      : null;
  return {
    id: withdrawal.id,
    amount_minor: withdrawal.amountMinor,
    fee_minor: withdrawal.feeMinor,
    net_amount_minor: withdrawal.netAmountMinor,
    currency: withdrawal.currency,
    destination: {
      method: withdrawal.destination.method,
      method_name: withdrawal.destination.methodName,
      name: withdrawal.destination.name,
    },
    state: withdrawal.state,
    reason: withdrawal.reason,
    created_at: withdrawal.createdAt,
    updated_at: withdrawal.updatedAt,
    account: withdrawal.account,
    reservation: withdrawal.reservation
      ? {
          amount_minor: withdrawal.reservation.amountMinor,
          currency: withdrawal.reservation.currency,
          state: withdrawal.reservation.state,
        }
      : null,
    external_reference: withdrawal.externalReference,
    completion_note: withdrawal.completionNote,
    completed_by: withdrawal.completedBy,
    completed_at: withdrawal.completedAt,
    payout_return: withdrawal.payoutReturn
      ? {
          id: withdrawal.payoutReturn.id,
          amount_minor: withdrawal.payoutReturn.amountMinor,
          restored_minor: withdrawal.payoutReturn.restoredMinor,
          reason: withdrawal.payoutReturn.reason,
          external_reference: withdrawal.payoutReturn.externalReference,
          actor_id: withdrawal.payoutReturn.actorId,
          correlation_id: withdrawal.payoutReturn.correlationId,
          idempotency_key: withdrawal.payoutReturn.idempotencyKey,
          created_at: withdrawal.payoutReturn.createdAt,
        }
      : null,
    payout_initiation: withdrawal.payoutInitiation
      ? {
          id: withdrawal.payoutInitiation.id,
          actor_id: withdrawal.payoutInitiation.actorId,
          actor_username: withdrawal.payoutInitiation.actorUsername,
          correlation_id: withdrawal.payoutInitiation.correlationId,
          idempotency_key: withdrawal.payoutInitiation.idempotencyKey,
          external_reference: withdrawal.payoutInitiation.externalReference,
          created_at: withdrawal.payoutInitiation.createdAt,
        }
      : null,
    payout_failure: withdrawal.payoutFailure
      ? {
          id: withdrawal.payoutFailure.id,
          actor_id: withdrawal.payoutFailure.actorId,
          actor_username: withdrawal.payoutFailure.actorUsername,
          correlation_id: withdrawal.payoutFailure.correlationId,
          idempotency_key: withdrawal.payoutFailure.idempotencyKey,
          external_reference: withdrawal.payoutFailure.externalReference,
          reason: withdrawal.payoutFailure.reason,
          created_at: withdrawal.payoutFailure.createdAt,
        }
      : null,
    attention: withdrawal.attention,
    payout_details: payoutDetails,
  };
}

export function presentWithdrawal(withdrawal: Withdrawal) {
  return withdrawalResponseSchema.parse({
    id: withdrawal.id,
    amount_minor: withdrawal.amount.minorAmount.toString(),
    fee_minor: withdrawal.fee?.minorAmount.toString() ?? "0",
    net_amount_minor:
      withdrawal.netAmount?.minorAmount.toString() ?? withdrawal.amount.minorAmount.toString(),
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
  });
}

export function presentWithdrawalPolicy(
  policy: {
    enabled: boolean;
    minimumAmount: { minorAmount: bigint; currency: string };
    maximumAmount: { minorAmount: bigint; currency: string } | null;
  },
  fees: FeePolicy,
) {
  const fee = fees.withdrawal;
  return {
    enabled: policy.enabled,
    minimum_amount_minor: policy.minimumAmount.minorAmount.toString(),
    maximum_amount_minor: policy.maximumAmount?.minorAmount.toString() ?? null,
    currency: policy.minimumAmount.currency,
    fee_enabled: fees.enabled && fee.enabled,
    fee_basis_points: fee.basisPoints.toString(),
    fee_maximum_amount_minor: fee.maximumMinor?.toString() ?? null,
  };
}
