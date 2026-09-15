import { z } from "@hono/zod-openapi";

export const operatorApiKeyMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key_prefix: z.string(),
  scopes: z.array(z.string()),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export const operatorApiKeyListSchema = z.object({
  items: z.array(operatorApiKeyMetadataSchema),
  manageable_scopes: z.array(z.string()),
});
