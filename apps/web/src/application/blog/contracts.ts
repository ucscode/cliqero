import type {
  BlogCategory,
  BlogCategoryRepository,
  BlogPost,
  BlogRenderablePost,
  BlogTagRepository,
} from "@/modules/blog/domain/blog";
import { CrudRepository } from "@/kernel/crud";

export interface BlogListOptions {
  search?: string;
  status?: "draft" | "published";
  category?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
  publishedOnly?: boolean;
  sort?: "created" | "title";
  direction?: "asc" | "desc";
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

export abstract class BlogRepository extends CrudRepository<
  [postId: string, input: BlogSaveInput, authorAccountId: string | null],
  [id: string],
  [id: string, input: BlogSaveInput, authorAccountId: string | null],
  [id: string],
  BlogPost,
  BlogPost | null,
  BlogPost | null,
  void
> {
  abstract findById(id: string): BlogPost | null;
  abstract transaction<T>(operation: () => T): T;
  abstract findIdempotency(key: string): { requestHash: string; postId: string } | null;
  abstract saveIdempotency(key: string, requestHash: string, postId: string): void;
  abstract findSlugOwner(slug: string): string | null;
  abstract get(idOrSlug: string, publishedOnly?: boolean): BlogPost | null;
  abstract list(options?: BlogListOptions): {
    items: BlogPost[];
    nextCursor: string | null;
    limit: number;
  };
  abstract categories(): BlogCategory[];
  abstract get categoryRepository(): BlogCategoryRepository;
  abstract tags(): unknown[];
  abstract get tagRepository(): BlogTagRepository;
  abstract savePreview(
    id: string,
    accountId: string,
    payload: BlogRenderablePost,
    now: number,
    expiresAt: number,
  ): void;
  abstract getPreview(id: string, accountId: string, now: number): BlogPreview | null;
  abstract deletePreview(id: string, accountId: string): void;
  abstract clearExpiredPreviews(now: number): void;
}
