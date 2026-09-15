import { z } from "@hono/zod-openapi";

export const operatorDistributionSummarySchema = z.object({
  id: z.string().uuid(),
  purchaseId: z.string().uuid(),
  listingId: z.string().uuid(),
  listingTitle: z.string(),
  buyer: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  grossAmountMinor: z.string(),
  currency: z.string(),
  referralAllocatedMinor: z.string(),
  platformRemainderMinor: z.string(),
  beneficiaryCount: z.number().int().nonnegative(),
  completedAt: z.string(),
});
export const operatorDistributionDetailSchema = operatorDistributionSummarySchema.extend({
  purchaseState: z.string(),
  purchaseCreatedAt: z.string(),
  attribution: z.object({
    id: z.string().uuid().nullable(),
    referrer: z
      .object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() })
      .nullable(),
  }),
  policySnapshot: z.unknown(),
  allocations: z.array(
    z.object({
      id: z.string().uuid(),
      account: z.object({
        id: z.string().uuid(),
        username: z.string(),
        email: z.string().nullable(),
      }),
      level: z.number().int().positive().nullable(),
      amountMinor: z.string(),
      currency: z.string(),
      direction: z.enum(["credit", "debit"]),
      entryType: z.string(),
      balanceState: z.string(),
      maturityAt: z.string().nullable(),
      settledAt: z.string().nullable(),
      originalEntryId: z.string().uuid().nullable(),
      reversalId: z.string().uuid().nullable(),
      createdAt: z.string(),
    }),
  ),
  reversal: z
    .object({
      id: z.string().uuid(),
      reason: z.string(),
      source: z.string(),
      state: z.string(),
      processedAt: z.string().nullable(),
    })
    .nullable(),
});
export const operatorEarningsEntrySchema = z.object({
  id: z.string().uuid(),
  account: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  purchaseId: z.string().uuid().nullable(),
  distributionId: z.string().uuid().nullable(),
  entryType: z.string(),
  direction: z.enum(["credit", "debit"]),
  amountMinor: z.string(),
  currency: z.string(),
  level: z.number().int().positive().nullable(),
  balanceState: z.string(),
  settledAt: z.string().nullable(),
  createdAt: z.string(),
});
