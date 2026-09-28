import type { BlogCategory, BlogPost } from "@/modules/blog/domain/blog";

export interface BlogListOptions {
  search?: string;
  status?: "draft" | "published";
  category?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
  publishedOnly?: boolean;
}

export interface BlogRevisionInput {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  desiredStatus: "draft" | "published";
  featuredImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  categoryId: string | null;
  tags: string[];
}

export interface BlogCategoryInput {
  name?: string;
  slug?: string;
}

export interface BlogRepository {
  transaction<T>(operation: () => T): T;
  findIdempotency(key: string): { requestHash: string; postId: string } | null;
  saveIdempotency(key: string, requestHash: string, postId: string): void;
  findSlugOwner(slug: string): string | null;
  create(postId: string, input: BlogRevisionInput, authorAccountId: string | null): BlogPost | null;
  saveRevision(
    postId: string,
    input: BlogRevisionInput,
    authorAccountId: string | null,
  ): BlogPost | null;
  applyPublication(id: string, desiredStatus: "draft" | "published"): BlogPost | null;
  delete(id: string): void;
  get(idOrSlug: string, publishedOnly?: boolean): BlogPost | null;
  getWorkingRevision(id: string): BlogPost | null;
  getRevision(id: string, revisionId: string): BlogPost | null;
  list(options?: BlogListOptions): {
    items: BlogPost[];
    nextCursor: string | null;
    limit: number;
  };
  categories(): BlogCategory[];
  createCategory(input: { name: string; slug: string }): BlogCategory;
  updateCategory(id: string, input: BlogCategoryInput): BlogCategory | null;
  deleteCategory(id: string): void;
  categoryIsUsed(id: string): boolean;
  tags(): unknown[];
}
