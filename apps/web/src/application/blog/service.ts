import { createHash } from "node:crypto";
import slugify from "slugify";
import { newId } from "@/kernel/ids";
import {
  blogPostInputSchema,
  type BlogPost,
  type BlogPostInput,
} from "@/modules/blog/domain/blog";
import type {
  BlogListOptions,
  BlogPersistenceInput,
  BlogRepository,
} from "@/application/blog/contracts";

export class BlogService {
  constructor(private readonly repository: BlogRepository) {}

  create(input: BlogPostInput, authorAccountId: string | null, idempotencyKey?: string) {
    const parsed = blogPostInputSchema.parse(input);
    const requestHash = hashRequest({ ...parsed, author_account_id: authorAccountId });
    return this.repository.transaction(() => {
      if (idempotencyKey) {
        const prior = this.repository.findIdempotency(idempotencyKey);
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new Error("Idempotency key conflicts with a different blog request");
          return this.repository.get(prior.postId);
        }
      }
      const id = newId();
      const desiredSlug = parsed.slug ?? slugBase(parsed.title);
      const prepared = this.prepare(
        id,
        parsed,
        this.uniqueSlug(desiredSlug),
        parsed.status === "published" ? new Date() : null,
      );
      const post = this.repository.create(prepared, authorAccountId);
      if (idempotencyKey && post)
        this.repository.saveIdempotency(idempotencyKey, requestHash, post.id);
      return post;
    });
  }

  update(id: string, input: Partial<BlogPostInput>) {
    const current = this.repository.get(id);
    if (!current) throw new Error("Blog post not found");
    const parsed = blogPostInputSchema.partial().parse(input);
    const merged = {
      title: current.title,
      excerpt: current.excerpt,
      content: current.content,
      status: current.status,
      featured_image_url: current.featuredImageUrl,
      seo_title: current.seoTitle,
      seo_description: current.seoDescription,
      canonical_url: current.canonicalUrl,
      category: current.category?.name ?? null,
      tags: current.tags.map((tag) => tag.name),
      ...parsed,
    };
    const publishedAt =
      merged.status === "published" ? current.publishedAt ?? new Date() : null;
    const post = this.repository.update(
      id,
      this.prepare(id, merged, current.slug, publishedAt),
    );
    if (!post) throw new Error("Blog post not found");
    return post;
  }

  publish(id: string, published: boolean) {
    const current = this.repository.get(id);
    if (!current) throw new Error("Blog post not found");
    const post = this.repository.setPublished(
      id,
      published ? current.publishedAt ?? new Date() : null,
    );
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

  private uniqueSlug(desired: string) {
    const base = desired || "post";
    let candidate = base;
    let n = 1;
    while (this.repository.findSlugOwner(candidate)) candidate = `${base}-${++n}`;
    return candidate;
  }

  private prepare(
    id: string,
    input: {
      title: string;
      excerpt: string;
      content: string;
      status: "draft" | "published";
      featured_image_url?: string | null;
      seo_title?: string | null;
      seo_description?: string | null;
      canonical_url?: string | null;
      category?: string | null;
      tags?: string[];
    },
    slug: string,
    publishedAt: Date | null,
  ): BlogPersistenceInput {
    return {
      id,
      slug,
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      status: input.status,
      featuredImageUrl: input.featured_image_url ?? null,
      seoTitle: input.seo_title ?? null,
      seoDescription: input.seo_description ?? null,
      canonicalUrl: input.canonical_url ?? null,
      publishedAt,
      category: normalize(input.category) || null,
      tags: [...new Set((input.tags ?? []).map(normalize).filter(Boolean))],
    };
  }
}

function hashRequest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function slugBase(title: string) {
  return slugify(title, { lower: true, strict: true, trim: true }) || "post";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
