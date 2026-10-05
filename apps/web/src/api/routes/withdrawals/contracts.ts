import { z } from "@hono/zod-openapi";

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
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
