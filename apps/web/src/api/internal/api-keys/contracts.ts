import { z } from "zod";
import { apiScopeSchema } from "@/modules/identity/api/scopes";

/**
 * Internal Operator UI contract for GET/POST /internal/api-keys and
 * GET/PATCH/DELETE /internal/api-keys/{apiKeyId}. Authentication and
 * authorization are session-only; account ownership is derived/enforced by
 * the application service. These schemas are deliberately not OpenAPI routes.
 */
export const apiKeyListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  account_id: z.uuid().optional(),
  state: z.enum(["all", "active", "expired", "deleted"]).default("all"),
  sort: z.enum(["created", "name", "expires"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export const apiKeyCreateSchema = z
  .object({
    account_id: z.uuid().optional(),
    name: z.string().min(1).max(100),
    scopes: z.array(apiScopeSchema).max(20).default([]),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .strict();

export const apiKeyUpdateSchema = z
  .object({
    account_id: z.uuid().optional(),
    name: z.string().min(1).max(100).optional(),
    scopes: z.array(apiScopeSchema).max(20).optional(),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
