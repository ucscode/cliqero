import { z } from "zod";

export const blogStatusSchema = z.enum(["draft", "published"]);
export const blogPostInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    excerpt: z.string().trim().max(500).default(""),
    content: z.string().min(1).max(500_000),
    status: blogStatusSchema.default("draft"),
    featured_image_url: z.string().url().max(2000).nullable().optional(),
    seo_title: z.string().trim().max(200).nullable().optional(),
    seo_description: z.string().trim().max(500).nullable().optional(),
    canonical_url: z.string().url().max(2000).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    author_account_id: z.string().uuid().nullable().optional(),
  })
  .strict();
export type BlogPostInput = z.infer<typeof blogPostInputSchema>;
export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  status: "draft" | "published";
  featuredImageUrl: string | null;
  authorAccountId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: { slug: string; name: string } | null;
  tags: Array<{ slug: string; name: string }>;
};
