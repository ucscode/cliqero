import { z } from "zod";
import { apiScopeSchema } from "@/modules/identity/api/scopes";

/**
 * Internal Operator UI contract for GET/POST /internal/api-keys,
 * GET/PATCH/DELETE /internal/api-keys/{apiKeyId}, and POST
 * /internal/api-keys/actions/delete. Authentication and
 * authorization are session-only; account ownership is derived/enforced by
 * the application service. These schemas are deliberately not OpenAPI routes.
 */
export const apiKeyListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  account_id: z.uuid().optional(),
  state: z.enum(["all", "active", "expired", "revoked"]).default("all"),
  sort: z.enum(["created", "name", "expires"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(2048).optional(),
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
    state: z.enum(["active", "revoked"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export const apiKeyBulkDeleteSchema = z.object({ ids: z.array(z.uuid()).min(1).max(100) }).strict();

export const apiKeyReassignSchema = z
  .object({
    account_id: z.uuid(),
    name: z.string().min(1).max(100),
    scopes: z.array(apiScopeSchema).max(20),
    expires_at: z.string().datetime().nullable(),
  })
  .strict();
