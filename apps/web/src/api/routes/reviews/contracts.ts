import { z } from "@hono/zod-openapi";

export const reviewResponseSchema = z
  .object({
    id: z.string().uuid(),
    listing_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    body: z.string().nullable(),
    status: z.enum(["pending", "approved", "rejected"]),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    moderated_at: z.iso.datetime().nullable(),
    reviewer: z.string().optional(),
    is_mine: z.boolean().optional(),
    listing_title: z.string().optional(),
  })
  .strict();

export const reviewPageSchema = z
  .object({
    items: z.array(reviewResponseSchema),
    next_cursor: z.string().nullable(),
  })
  .strict();
