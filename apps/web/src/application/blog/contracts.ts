import type { BlogPost } from "@/modules/blog/domain/blog";

export interface BlogListOptions {
  search?: string;
  status?: "draft" | "published";
  category?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
  publishedOnly?: boolean;
}

export interface BlogPersistenceInput {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  status: "draft" | "published";
  featuredImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  publishedAt: Date | null;
  category: string | null;
  tags: string[];
}

export interface BlogRepository {
  transaction<T>(operation: () => T): T;
  findIdempotency(key: string): { requestHash: string; postId: string } | null;
  saveIdempotency(key: string, requestHash: string, postId: string): void;
  findSlugOwner(slug: string): string | null;
  create(input: BlogPersistenceInput, authorAccountId: string | null): BlogPost | null;
  update(id: string, input: BlogPersistenceInput): BlogPost | null;
  setPublished(id: string, publishedAt: Date | null): BlogPost | null;
  delete(id: string): void;
  get(idOrSlug: string, publishedOnly?: boolean): BlogPost | null;
  list(options?: BlogListOptions): {
    items: BlogPost[];
    nextCursor: string | null;
    limit: number;
  };
  categories(): unknown[];
  tags(): unknown[];
}
