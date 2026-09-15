import { z } from "@hono/zod-openapi";

export const capabilityAdministrationSchema = z.object({
  accountId: z.string().uuid(),
  assignments: z.array(z.object({ capability: z.string(), grantedAt: z.string() })),
  manageableCapabilities: z.array(z.string()),
  isSelf: z.boolean(),
});
