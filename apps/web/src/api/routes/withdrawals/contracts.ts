import { z } from "@hono/zod-openapi";
import { withdrawalResponseSchema } from "@/api/compat/withdrawals/contracts";

export const operatorWithdrawalStateSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "failed",
]);
export const operatorWithdrawalAttentionSchema = z.enum(["review", "action_required", "none"]);
export const operatorWithdrawalPatchSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("approved") }).strict(),
  z.object({ status: z.literal("rejected"), reason: z.string().min(3).max(500) }).strict(),
  z
    .object({ status: z.literal("cancelled"), reason: z.string().min(3).max(500).optional() })
    .strict(),
]);
export const operatorWithdrawalCompleteSchema = z
  .object({
    external_reference: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export const operatorPayoutReturnRequestSchema = z
  .object({
    amount_minor: z.string().regex(/^\d+$/).describe("Returned provider payout in minor units."),
    reason: z.string().trim().min(3).max(1000),
    external_reference: z.string().trim().min(1).max(200),
  })
  .strict();
export const operatorPayoutInitiationRequestSchema = z
  .object({ external_reference: z.string().trim().max(200).nullable().optional() })
  .strict();
export const operatorPayoutInitiationResponseSchema = z.object({
  initiation: z.object({
    id: z.string().uuid(),
    withdrawalId: z.string().uuid(),
    actorId: z.string().uuid(),
    correlationId: z.string().uuid(),
    idempotencyKey: z.string(),
    externalReference: z.string().nullable(),
    createdAt: z.string(),
  }),
  changed: z.boolean(),
});
export const operatorPayoutFailureRequestSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
    external_reference: z.string().trim().min(1).max(200),
  })
  .strict();
export const operatorPayoutFailureResponseSchema = z.object({
  failure: z.object({
    id: z.string().uuid(),
    withdrawalId: z.string().uuid(),
    actorId: z.string().uuid(),
    correlationId: z.string().uuid(),
    idempotencyKey: z.string(),
    externalReference: z.string(),
    reason: z.string(),
    createdAt: z.string(),
  }),
  changed: z.boolean(),
});
export const operatorPayoutReturnResponseSchema = z.object({
  payoutReturn: z.object({
    id: z.string().uuid(),
    withdrawalId: z.string().uuid(),
    amountMinor: z.string(),
    restoredMinor: z.string(),
    reason: z.string(),
    externalReference: z.string(),
    actorId: z.string().uuid(),
    correlationId: z.string().uuid(),
    idempotencyKey: z.string(),
  }),
  changed: z.boolean(),
});
export const operatorWithdrawalSchema = z.object({
  id: z.string().uuid(),
  account: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  amountMinor: z.string(),
  currency: z.string(),
  destination: z.object({ method: z.string(), methodName: z.string(), name: z.string() }),
  state: operatorWithdrawalStateSchema,
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  reservation: z
    .object({
      amountMinor: z.string(),
      currency: z.string(),
      state: z.enum(["reserved", "released", "completed", "returned"]),
    })
    .nullable(),
  externalReference: z.string().nullable(),
  completionNote: z.string().nullable(),
  completedBy: z.string().uuid().nullable(),
  completedAt: z.string().nullable(),
  payoutReturn: z
    .object({
      id: z.string().uuid(),
      amountMinor: z.string(),
      restoredMinor: z.string(),
      reason: z.string(),
      externalReference: z.string(),
      actorId: z.string().uuid(),
      correlationId: z.string().uuid(),
      idempotencyKey: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  payoutInitiation: z
    .object({
      id: z.string().uuid(),
      actorId: z.string().uuid(),
      actorUsername: z.string(),
      correlationId: z.string().uuid(),
      idempotencyKey: z.string(),
      externalReference: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
  payoutFailure: z
    .object({
      id: z.string().uuid(),
      actorId: z.string().uuid(),
      actorUsername: z.string(),
      correlationId: z.string().uuid(),
      idempotencyKey: z.string(),
      externalReference: z.string(),
      reason: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  attention: operatorWithdrawalAttentionSchema,
});
export const operatorWithdrawalDetailSchema = operatorWithdrawalSchema.extend({
  destination: operatorWithdrawalSchema.shape.destination.extend({
    savedDestinationId: z.string().uuid(),
    fields: z.array(
      z.object({
        name: z.string(),
        label: z.string(),
        value: z.string(),
        displayValue: z.string().optional(),
        type: z.enum(["text", "select", "textarea", "fixed", "hidden"]),
        copyable: z.boolean(),
      }),
    ),
  }),
});

const withdrawalPayoutDetailsSchema = z.object({
  saved_destination_id: z.string().uuid(),
  fields: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      value: z.string(),
      display_value: z.string().optional(),
      type: z.enum(["text", "select", "textarea", "fixed", "hidden"]),
      copyable: z.boolean(),
    }),
  ),
});
export const withdrawalResourceSchema = withdrawalResponseSchema.extend({
  account: z
    .object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() })
    .nullable(),
  reservation: z
    .object({
      amount_minor: z.string(),
      currency: z.string(),
      state: z.enum(["reserved", "released", "completed", "returned"]),
    })
    .nullable(),
  external_reference: z.string().nullable(),
  completion_note: z.string().nullable(),
  completed_by: z.string().uuid().nullable(),
  completed_at: z.string().nullable(),
  payout_return: z
    .object({
      id: z.string().uuid(),
      amount_minor: z.string(),
      restored_minor: z.string(),
      reason: z.string(),
      external_reference: z.string(),
      actor_id: z.string().uuid(),
      correlation_id: z.string().uuid(),
      idempotency_key: z.string(),
      created_at: z.string(),
    })
    .nullable(),
  payout_initiation: z
    .object({
      id: z.string().uuid(),
      actor_id: z.string().uuid(),
      actor_username: z.string(),
      correlation_id: z.string().uuid(),
      idempotency_key: z.string(),
      external_reference: z.string().nullable(),
      created_at: z.string(),
    })
    .nullable(),
  payout_failure: z
    .object({
      id: z.string().uuid(),
      actor_id: z.string().uuid(),
      actor_username: z.string(),
      correlation_id: z.string().uuid(),
      idempotency_key: z.string(),
      external_reference: z.string(),
      reason: z.string(),
      created_at: z.string(),
    })
    .nullable(),
  attention: operatorWithdrawalAttentionSchema.nullable(),
  payout_details: withdrawalPayoutDetailsSchema.nullable(),
});
export const withdrawalCollectionSchema = z.object({
  items: z.array(withdrawalResourceSchema),
  next_cursor: z.string().nullable(),
  wallet_summary: z
    .object({
      available_minor: z.string(),
      reservations: z.array(
        z.object({ currency: z.string(), reserved_minor: z.string(), completed_minor: z.string() }),
      ),
    })
    .nullable(),
});

/** JSON representation returned by WithdrawalService.update/cancel/complete. */
export const withdrawalMutationResponseSchema = z
  .object({
    id: z.string().uuid(),
    accountId: z.string().uuid(),
    amount: z.object({ minorAmount: z.string(), currency: z.string() }),
    fee: z.object({ minorAmount: z.string(), currency: z.string() }).optional(),
    netAmount: z.object({ minorAmount: z.string(), currency: z.string() }).optional(),
    destination: z.object({
      savedDestinationId: z.string().uuid(),
      method: z.string(),
      methodName: z.string(),
      name: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          label: z.string(),
          value: z.string(),
          displayValue: z.string().optional(),
          type: z.enum(["text", "select", "textarea", "fixed", "hidden"]),
          copyable: z.boolean(),
        }),
      ),
    }),
    state: operatorWithdrawalStateSchema,
    idempotencyKey: z.string(),
    correlationId: z.string().uuid(),
    reason: z.string().nullable().optional(),
    externalReference: z.string().nullable().optional(),
    completionNote: z.string().nullable().optional(),
    completedBy: z.string().uuid().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    payoutInitiation: z
      .object({
        id: z.string().uuid(),
        withdrawalId: z.string().uuid(),
        actorId: z.string().uuid(),
        correlationId: z.string().uuid(),
        idempotencyKey: z.string(),
        externalReference: z.string().nullable(),
        createdAt: z.string(),
      })
      .nullable()
      .optional(),
    payoutFailure: z
      .object({
        id: z.string().uuid(),
        withdrawalId: z.string().uuid(),
        actorId: z.string().uuid(),
        correlationId: z.string().uuid(),
        idempotencyKey: z.string(),
        externalReference: z.string(),
        reason: z.string(),
        createdAt: z.string(),
      })
      .nullable()
      .optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
