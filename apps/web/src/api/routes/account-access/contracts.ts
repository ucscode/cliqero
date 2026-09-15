import { z } from "@hono/zod-openapi";

export const accountAccessSchema = z.object({
  accountId: z.string().uuid(),
  capabilities: z.array(z.string()),
  canAccessOperator: z.boolean(),
});
