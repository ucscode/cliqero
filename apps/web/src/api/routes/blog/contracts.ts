import { z } from "@hono/zod-openapi";

const categorySchema = z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() });
export const blogPostSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  content: z.string(),
  status: z.enum(["draft", "published"]),
  featuredImageUrl: z.string().nullable(),
  authorAccountId: z.string().uuid().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  categories: z.array(categorySchema),
  tags: z.array(z.object({ slug: z.string(), name: z.string() })),
});
export const operatorBlogPostSchema = blogPostSchema;
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
