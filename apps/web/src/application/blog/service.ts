import type { BlogPost, BlogPostInput } from "@/modules/blog/domain/blog";
import type { BlogListOptions, BlogRepository } from "@/application/blog/contracts";

export class BlogService {
  constructor(private readonly repository: BlogRepository) {}

  create(input: BlogPostInput, authorAccountId: string | null, idempotencyKey?: string) {
    return this.repository.create(input, authorAccountId, idempotencyKey);
  }

  update(id: string, input: Partial<BlogPostInput>) {
    const post = this.repository.update(id, input);
    if (!post) throw new Error("Blog post not found");
    return post;
  }

  publish(id: string, published: boolean) {
    const post = this.repository.publish(id, published);
    if (!post) throw new Error("Blog post not found");
    return post;
  }

  delete(id: string) {
    this.repository.delete(id);
  }

  get(idOrSlug: string, publishedOnly = false): BlogPost | null {
    return this.repository.get(idOrSlug, publishedOnly);
  }

  list(options: BlogListOptions = {}) {
    return this.repository.list(options);
  }

  categories() {
    return this.repository.categories();
  }

  tags() {
    return this.repository.tags();
  }
}
