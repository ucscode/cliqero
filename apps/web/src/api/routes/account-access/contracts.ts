import { z } from "@hono/zod-openapi";

export const accountAccessSchema = z.object({
  accountId: z.string().uuid(),
  capabilities: z.array(z.string()),
  canAccessOperator: z.boolean(),
});

export const applicationSessionSchema = z.object({
  authenticated: z.literal(true),
  account: z.object({
    id: z.string().uuid(),
    username: z.string(),
  }),
});
