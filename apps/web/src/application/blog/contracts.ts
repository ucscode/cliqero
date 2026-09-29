import type { BlogCategory, BlogPost, BlogRenderablePost } from "@/modules/blog/domain/blog";

export interface BlogListOptions {
  search?: string;
  status?: "draft" | "published";
  category?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
  publishedOnly?: boolean;
}

export interface BlogSaveInput {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  status: "draft" | "published";
  featuredImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  categoryIds: string[];
  tags: string[];
}

export interface BlogCategoryInput {
  name?: string;
  slug?: string;
}

export interface BlogPreview {
  id: string;
  accountId: string;
  payload: BlogRenderablePost;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface BlogRepository {
  transaction<T>(operation: () => T): T;
  findIdempotency(key: string): { requestHash: string; postId: string } | null;
  saveIdempotency(key: string, requestHash: string, postId: string): void;
  findSlugOwner(slug: string): string | null;
  create(postId: string, input: BlogSaveInput, authorAccountId: string | null): BlogPost;
  save(id: string, input: BlogSaveInput, authorAccountId: string | null): BlogPost | null;
  delete(id: string): void;
  get(idOrSlug: string, publishedOnly?: boolean): BlogPost | null;
  list(options?: BlogListOptions): { items: BlogPost[]; nextCursor: string | null; limit: number };
  categories(): BlogCategory[];
  createCategory(input: { name: string; slug: string }): BlogCategory;
  updateCategory(id: string, input: BlogCategoryInput): BlogCategory | null;
  deleteCategory(id: string): void;
  categoryIsUsed(id: string): boolean;
  tags(): unknown[];
  savePreview(
    id: string,
    accountId: string,
    payload: BlogRenderablePost,
    now: number,
    expiresAt: number,
  ): void;
  getPreview(id: string, accountId: string, now: number): BlogPreview | null;
  deletePreview(id: string, accountId: string): void;
  clearExpiredPreviews(now: number): void;
}
