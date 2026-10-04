import { z } from "@hono/zod-openapi";

const listingMetadataValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .openapi({
    anyOf: [
      { type: "string", nullable: true },
      { type: "number", nullable: true },
      { type: "boolean", nullable: true },
    ],
  });

const listingFields = {
  title: z.string().min(1),
  short_description: z.string().max(200),
  long_description: z.string(),
  price_minor: z.string().regex(/^\d+$/),
  currency: z.string().length(3),
  destination: z.url(),
  metadata: z.record(z.string(), listingMetadataValueSchema),
  compare_at_price_minor: z.string().regex(/^\d+$/).nullable(),
  featured_position: z.number().int().positive().nullable(),
  visibility: z.enum(["public", "authenticated"]),
  state: z.enum(["draft", "published", "archived"]),
  category_ids: z
    .array(z.uuid())
    .max(30)
    .refine((ids) => new Set(ids).size === ids.length, "Category IDs must be unique"),
};

export const listingCreateSchema = z
  .object({
    ...listingFields,
    short_description: z.string().max(200).default(""),
    long_description: z.string().default(""),
    metadata: z.record(z.string(), listingMetadataValueSchema).optional(),
    external_key: z.string().max(128).optional(),
    featured_position: z.number().int().positive().nullable().optional(),
    state: z.enum(["draft", "published", "archived"]).optional(),
    compare_at_price_minor: z.string().regex(/^\d+$/).nullable().optional(),
    visibility: z.enum(["public", "authenticated"]).optional(),
    category_ids: z
      .array(z.uuid())
      .max(30)
      .refine((ids) => new Set(ids).size === ids.length, "Category IDs must be unique")
      .optional(),
  })
  .strict();

export const listingPatchSchema = z.object(listingFields).partial().strict();

const listingProjectionFields = {
  id: z.uuid(),
  managed_by: z.uuid(),
  title: z.string(),
  short_description: z.string(),
  long_description: z.string(),
  price: z.object({ minor_amount: z.string(), currency: z.string() }),
  compare_at_price: z.object({ minor_amount: z.string(), currency: z.string() }).nullable(),
  visibility: z.enum(["public", "authenticated"]),
  categories: z.array(z.object({ id: z.uuid(), name: z.string(), slug: z.string() })),
  metadata: z.record(z.string(), listingMetadataValueSchema),
  state: z.enum(["draft", "published", "archived"]),
  featured_position: z.number().int().nullable(),
};

export const listingViewSchema = z.object(listingProjectionFields);
export const ownerListingViewSchema = listingViewSchema.extend({
  destination: z.url(),
  external_key: z.string().nullable(),
});

export const listingWithMediaViewSchema = listingViewSchema
  .extend({
    destination: z.url().optional(),
    external_key: z.string().nullable().optional(),
    media: z.array(
      z.object({
        id: z.uuid(),
        url: z.url(),
        mime_type: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
        width: z.number().int(),
        height: z.number().int(),
        position: z.number().int(),
        alt_text: z.string().nullable(),
      }),
    ),
    rating: z.object({ average: z.number(), count: z.number().int() }).nullable(),
    review_count: z.number().int().optional(),
    purchase_count: z.number().int().optional(),
  })
  .strict();

export const listingPageSchema = z
  .object({ items: z.array(listingWithMediaViewSchema), next_cursor: z.string().nullable() })
  .strict();
