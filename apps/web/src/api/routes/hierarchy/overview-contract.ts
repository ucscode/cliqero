import { z } from "@hono/zod-openapi";

export const operatorOverviewSchema = z.object({
  capabilities: z.array(z.string()),
  catalogue: z.object({
    published: z.number().int().nonnegative(),
    draft: z.number().int().nonnegative(),
    archived: z.number().int().nonnegative(),
  }),
  users: z.object({ total: z.number().int().nonnegative() }).optional(),
  commerce: z.object({ purchases: z.number().int().nonnegative() }).optional(),
  withdrawals: z
    .object({
      requested: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
    })
    .optional(),
});
