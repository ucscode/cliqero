import { createHash } from "node:crypto";
import slugify from "slugify";
import { newId } from "@/kernel/ids";
import {
  blogPostInputSchema,
  BlogCategoryInUseError,
  type BlogCategory,
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
      this.requireCategory(prepared.categoryId);
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
      category_id: current.category?.id ?? null,
      tags: current.tags.map((tag) => tag.name),
      ...parsed,
    };
    const publishedAt = merged.status === "published" ? (current.publishedAt ?? new Date()) : null;
    const prepared = this.prepare(id, merged, current.slug, publishedAt);
    this.requireCategory(prepared.categoryId);
    const post = this.repository.update(id, prepared);
    if (!post) throw new Error("Blog post not found");
    return post;
  }

  publish(id: string, published: boolean) {
    const current = this.repository.get(id);
    if (!current) throw new Error("Blog post not found");
    const post = this.repository.setPublished(
      id,
      published ? (current.publishedAt ?? new Date()) : null,
    );
    if (!post) throw new Error("Blog post not found");
    return post;
  }

  delete(id: string) {
    this.repository.delete(id);
  }

  bulk(ids: string[], action: "publish" | "unpublish" | "delete", maximum: number) {
    const validIds = ids.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
    );
    if (
      !Number.isInteger(maximum) ||
      maximum < 1 ||
      !ids.length ||
      !validIds ||
      new Set(ids).size !== ids.length ||
      ids.length > maximum
    )
      throw new Error(`Select between 1 and ${maximum} unique blog posts using valid IDs.`);
    return ids.map((id) => {
      try {
        if (action === "delete") this.delete(id);
        else this.publish(id, action === "publish");
        return { id, success: true as const };
      } catch (error) {
        return {
          id,
          success: false as const,
          error: error instanceof Error ? error.message : "Unable to update this article.",
        };
      }
    });
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

  createCategory(name: string): BlogCategory {
    const normalized = normalize(name);
    if (!normalized || normalized.length > 100)
      throw new Error("Category name must be 1–100 characters.");
    if (
      this.repository
        .categories()
        .some((category) => category.name.toLowerCase() === normalized.toLowerCase())
    )
      throw new Error("A category with this name already exists.");
    return this.repository.createCategory(normalized);
  }

  updateCategory(id: string, name: string): BlogCategory {
    const normalized = normalize(name);
    if (!normalized || normalized.length > 100)
      throw new Error("Category name must be 1–100 characters.");
    if (
      this.repository
        .categories()
        .some(
          (category) =>
            category.id !== id && category.name.toLowerCase() === normalized.toLowerCase(),
        )
    )
      throw new Error("A category with this name already exists.");
    const category = this.repository.updateCategory(id, normalized);
    if (!category) throw new Error("Blog category not found");
    return category;
  }

  deleteCategory(id: string): void {
    if (!this.repository.categories().some((category) => category.id === id))
      throw new Error("Blog category not found");
    if (this.repository.categoryIsUsed(id)) throw new BlogCategoryInUseError();
    this.repository.deleteCategory(id);
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
      category_id?: string | null;
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
      categoryId: input.category_id ?? null,
      tags: [...new Set((input.tags ?? []).map(normalize).filter(Boolean))],
    };
  }

  private requireCategory(categoryId: string | null) {
    if (categoryId && !this.repository.categories().some((category) => category.id === categoryId))
      throw new Error("The selected blog category no longer exists.");
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
