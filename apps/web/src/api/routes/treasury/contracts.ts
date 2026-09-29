import { z } from "@hono/zod-openapi";

export const operatorTreasuryEntrySchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(["credit", "debit"]),
  amountMinor: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  source: z.object({ kind: z.string(), id: z.string().uuid() }).nullable(),
  actor: z
    .object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() })
    .nullable(),
  createdAt: z.string(),
});
export const operatorTreasurySummarySchema = z.object({
  balanceMinor: z.string(),
  creditsMinor: z.string(),
  debitsMinor: z.string(),
  currency: z.literal("USD"),
});
