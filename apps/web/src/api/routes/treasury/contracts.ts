import { z } from "@hono/zod-openapi";

export const operatorTreasuryEntrySchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(["credit", "debit"]),
  amountMinor: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  source: z.object({ kind: z.string(), id: z.string().uuid() }).nullable(),
  actor: z
    .object({
      id: z.string().uuid().nullable(),
      username: z.string().nullable(),
      email: z.string().nullable(),
      kind: z.enum(["customer", "operator", "system"]).nullable(),
    })
    .nullable(),
  correlationId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export const operatorTreasurySummarySchema = z.object({
  balanceMinor: z.string(),
  creditsMinor: z.string(),
  debitsMinor: z.string(),
  currency: z.literal("USD"),
});
