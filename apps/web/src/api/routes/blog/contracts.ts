import { z } from "@hono/zod-openapi";

export const blogPostSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  content: z.string(),
  desiredStatus: z.enum(["draft", "published"]),
  featuredImageUrl: z.string().nullable(),
  authorAccountId: z.string().uuid().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  category: z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() }).nullable(),
  tags: z.array(z.object({ slug: z.string(), name: z.string() })),
});
export const operatorBlogPostSchema = blogPostSchema.extend({
  publicationStatus: z.enum(["draft", "published"]),
  hasWorkingRevision: z.boolean(),
  workingRevisionUpdatedAt: z.string().nullable(),
  revisionId: z.string(),
});
export const operatorBlogPageSchema = z.object({
  items: z.array(operatorBlogPostSchema),
  nextCursor: z.string().nullable(),
  limit: z.number().int(),
});
export const blogPageSchema = z.object({
  items: z.array(blogPostSchema),
  nextCursor: z.string().nullable(),
  limit: z.number().int(),
});
