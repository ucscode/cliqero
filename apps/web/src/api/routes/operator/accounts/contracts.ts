import { z } from "@hono/zod-openapi";

export const operatorAccountSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.string(),
  directReferralCount: z.number().int().nonnegative(),
});
export const operatorAccountDetailSchema = operatorAccountSummarySchema.extend({
  parent: z
    .object({ id: z.string().uuid(), username: z.string(), displayName: z.string().nullable() })
    .nullable(),
  purchaseCount: z.number().int().nonnegative(),
  latestParentReassignment: z
    .object({
      actorId: z.string().uuid().nullable(),
      previousParentId: z.string().uuid().nullable(),
      parentId: z.string().uuid().nullable(),
      occurredAt: z.string(),
    })
    .nullable(),
});
