import { z } from "zod";
import { PublicApplicationError } from "@/kernel/errors";
import { CrudRepository } from "@/kernel/crud";

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
    category_ids: z.array(z.string().uuid()).max(30).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  })
  .strict();
export type BlogPostInput = z.input<typeof blogPostInputSchema>;

export const blogCategoryNameSchema = z.string().trim().min(1).max(100);
export const blogCategorySlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type BlogCategory = { id: string; slug: string; name: string };
export type BlogTag = { slug: string; name: string };
export type BlogTagRecord = { id: string; slug: string; name: string };

export class BlogTagConflictError extends PublicApplicationError {
  constructor(readonly field: "name" | "slug") {
    super(`A blog tag with this ${field} already exists.`, `tag_${field}_conflict`, 409);
    this.name = "BlogTagConflictError";
  }
}

export abstract class BlogTagRepository extends CrudRepository<
  [input: BlogTagRecord],
  [id: string],
  [id: string, input: Partial<Pick<BlogTagRecord, "slug" | "name">>],
  [id: string],
  BlogTagRecord,
  BlogTagRecord | null,
  BlogTagRecord | null,
  void
> {
  abstract list(): BlogTagRecord[];
}

export abstract class BlogCategoryRepository extends CrudRepository<
  [input: { name: string; slug: string }],
  [id: string],
  [id: string, input: { name?: string; slug?: string }],
  [id: string],
  BlogCategory,
  BlogCategory | null,
  BlogCategory | null,
  void
> {
  abstract transaction<T>(operation: () => T): T;
  abstract list(): BlogCategory[];
  abstract isUsed(id: string): boolean;
  abstract deleteForRoot(id: string): void;
}

/** The common renderer contract for canonical posts and private editor snapshots. */
export type BlogRenderablePost = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  categories: BlogCategory[];
  tags: BlogTag[];
};

export const blogRenderablePostSchema: z.ZodType<BlogRenderablePost> = z.object({
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  content: z.string(),
  featuredImageUrl: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  categories: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
  tags: z.array(z.object({ slug: z.string(), name: z.string() })),
});

export type BlogPost = BlogRenderablePost & {
  id: string;
  status: "draft" | "published";
  authorAccountId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class BlogCategoryInUseError extends PublicApplicationError {
  constructor() {
    super(
      "This category is assigned to one or more articles. Reassign them before deleting it.",
      "category_in_use",
      409,
    );
    this.name = "BlogCategoryInUseError";
  }
}
export class BlogCategoryConflictError extends PublicApplicationError {
  constructor(readonly field: "name" | "slug") {
    super(`A category with this ${field} already exists.`, `category_${field}_conflict`, 409);
    this.name = "BlogCategoryConflictError";
  }
}
export class BlogCategoryNotFoundError extends PublicApplicationError {
  constructor() {
    super("Blog category not found", "not_found", 404);
    this.name = "BlogCategoryNotFoundError";
  }
}
export class BlogPostNotFoundError extends PublicApplicationError {
  constructor() {
    super("Blog post not found", "not_found", 404);
    this.name = "BlogPostNotFoundError";
  }
}
export class BlogSlugConflictError extends PublicApplicationError {
  constructor() {
    super("A blog post with this slug already exists.", "blog_slug_conflict", 409);
    this.name = "BlogSlugConflictError";
  }
}
