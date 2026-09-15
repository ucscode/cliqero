import { z } from "@hono/zod-openapi";

export const operatorWithdrawalStateSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "failed",
]);
export const operatorWithdrawalAttentionSchema = z.enum([
  "review",
  "payout",
  "reconciliation",
  "retry",
  "retry_wait",
  "none",
]);
export const operatorWithdrawalSchema = z.object({
  id: z.string().uuid(),
  account: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  amountMinor: z.string(),
  currency: z.string(),
  destination: z.object({ type: z.enum(["bank", "manual"]), summary: z.string() }),
  state: operatorWithdrawalStateSchema,
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  reservation: z
    .object({
      amountMinor: z.string(),
      currency: z.string(),
      state: z.enum(["reserved", "released", "completed"]),
    })
    .nullable(),
  payout: z
    .object({
      provider: z.string(),
      state: z.enum(["ready", "submitted", "succeeded", "failed", "unknown"]),
      attemptCount: z.number().int(),
      nextAttemptAt: z.string().nullable(),
      lastError: z.string().nullable(),
      providerReference: z.string().nullable(),
    })
    .nullable(),
  attention: operatorWithdrawalAttentionSchema,
});
export const operatorWithdrawalDetailSchema = operatorWithdrawalSchema.extend({
  attempts: z.array(
    z.object({
      id: z.string().uuid(),
      number: z.number().int(),
      provider: z.string(),
      state: z.string(),
      providerReference: z.string().nullable(),
      failureCategory: z.string().nullable(),
      failureReason: z.string().nullable(),
      createdAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
});
