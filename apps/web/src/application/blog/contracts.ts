import type { BlogPost, BlogPostInput } from "@/modules/blog/domain/blog";

export interface BlogListOptions {
  search?: string;
  status?: "draft" | "published";
  category?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
  publishedOnly?: boolean;
}

export interface BlogRepository {
  create(
    input: BlogPostInput,
    authorAccountId: string | null,
    idempotencyKey?: string,
  ): BlogPost | null;
  update(id: string, input: Partial<BlogPostInput>): BlogPost | null;
  publish(id: string, published: boolean): BlogPost | null;
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
