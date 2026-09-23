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
export const operatorWithdrawalPatchSchema = z.union([
  z.object({ status: z.literal("approved") }).strict(),
  z.object({ status: z.literal("rejected"), reason: z.string().min(3).max(500) }).strict(),
  z
    .object({
      status: z.literal("completed"),
      external_reference: z.string().min(1).max(200).optional(),
      note: z.string().min(1).max(500).optional(),
    })
    .strict(),
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
  externalReference: z.string().nullable(),
  completionNote: z.string().nullable(),
  completedBy: z.string().uuid().nullable(),
  completedAt: z.string().nullable(),
  attention: operatorWithdrawalAttentionSchema,
});
export const operatorWithdrawalDetailSchema = operatorWithdrawalSchema;
