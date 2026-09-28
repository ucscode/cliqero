import { createHash } from "node:crypto";
import slugify from "slugify";
import { newId } from "@/kernel/ids";
import {
  blogCategoryNameSchema,
  blogCategorySlugSchema,
  blogPostInputSchema,
  BlogCategoryConflictError,
  BlogCategoryInUseError,
  BlogCategoryNotFoundError,
  BlogPostNotFoundError,
  BlogSlugConflictError,
  BlogPublicationConflictError,
  type BlogCategory,
  type BlogPost,
  type BlogPostInput,
} from "@/modules/blog/domain/blog";
import type {
  BlogCategoryInput,
  BlogListOptions,
  BlogRepository,
  BlogRevisionInput,
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
          const existing = this.repository.get(prior.postId);
          if (!existing) throw new BlogPostNotFoundError();
          return existing;
        }
      }
      const postId = newId();
      const desiredSlug = parsed.slug ?? slugBase(parsed.title);
      const slug = parsed.slug
        ? this.requireAvailableSlug(parsed.slug)
        : this.uniqueGeneratedSlug(desiredSlug);
      this.requireCategory(parsed.category_id);
      const post = this.repository.create(
        postId,
        this.prepare(newId(), parsed, slug),
        authorAccountId,
      );
      if (!post) throw new BlogPostNotFoundError();
      if (idempotencyKey && post)
        this.repository.saveIdempotency(idempotencyKey, requestHash, postId);
      return post;
    });
  }

  save(id: string, input: Partial<BlogPostInput>, authorAccountId: string | null) {
    const current = this.repository.get(id);
    if (!current) throw new BlogPostNotFoundError();
    const parsed = blogPostInputSchema.partial().parse(input);
    const merged = {
      title: current.title,
      slug: current.slug,
      excerpt: current.excerpt,
      content: current.content,
      desired_status: current.desiredStatus,
      featured_image_url: current.featuredImageUrl,
      seo_title: current.seoTitle,
      seo_description: current.seoDescription,
      canonical_url: current.canonicalUrl,
      category_id: current.category?.id ?? null,
      tags: current.tags.map((tag) => tag.name),
      ...parsed,
    };
    const slug = parsed.slug ? this.requireAvailableSlug(parsed.slug, id) : current.slug;
    this.requireCategory(merged.category_id);
    const post = this.repository.saveRevision(
      id,
      this.prepare(newId(), merged, slug),
      authorAccountId,
    );
    if (!post) throw new BlogPostNotFoundError();
    return post;
  }

  applyStatus(id: string, desiredStatus: "draft" | "published") {
    if (!this.repository.get(id)) throw new BlogPostNotFoundError();
    const post = this.repository.applyPublication(id, desiredStatus);
    if (!post) throw new BlogPublicationConflictError();
    return post;
  }

  publish(id: string) {
    return this.applyStatus(id, "published");
  }

  unpublish(id: string) {
    return this.applyStatus(id, "draft");
  }

  delete(id: string) {
    if (!this.repository.get(id)) throw new BlogPostNotFoundError();
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
        else this.applyStatus(id, action === "publish" ? "published" : "draft");
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

  getWorkingRevision(id: string): BlogPost | null {
    return this.repository.getWorkingRevision(id);
  }

  getRevision(id: string, revisionId: string): BlogPost | null {
    return this.repository.getRevision(id, revisionId);
  }

  list(options: BlogListOptions = {}) {
    return this.repository.list(options);
  }

  categories() {
    return this.repository.categories();
  }

  createCategory(name: string, suppliedSlug?: string): BlogCategory {
    return this.repository.transaction(() => {
      const normalized = blogCategoryNameSchema.parse(name);
      const slug =
        suppliedSlug === undefined || suppliedSlug === ""
          ? this.uniqueCategorySlug(slugBase(normalized))
          : blogCategorySlugSchema.parse(suppliedSlug);
      this.ensureCategoryValuesAvailable(normalized, slug);
      return this.repository.createCategory({ name: normalized, slug });
    });
  }

  updateCategory(id: string, input: BlogCategoryInput): BlogCategory {
    return this.repository.transaction(() => {
      const current = this.repository.categories().find((category) => category.id === id);
      if (!current) throw new BlogCategoryNotFoundError();
      const name = input.name === undefined ? undefined : blogCategoryNameSchema.parse(input.name);
      const slug = input.slug === undefined ? undefined : blogCategorySlugSchema.parse(input.slug);
      this.ensureCategoryValuesAvailable(name ?? current.name, slug ?? current.slug, id);
      const category = this.repository.updateCategory(id, { name, slug });
      if (!category) throw new BlogCategoryNotFoundError();
      return category;
    });
  }

  deleteCategory(id: string): void {
    if (!this.repository.categories().some((category) => category.id === id))
      throw new BlogCategoryNotFoundError();
    if (this.repository.categoryIsUsed(id)) throw new BlogCategoryInUseError();
    this.repository.deleteCategory(id);
  }

  tags() {
    return this.repository.tags();
  }

  private uniqueGeneratedSlug(desired: string) {
    const base = desired || "post";
    let candidate = base;
    let n = 1;
    while (this.repository.findSlugOwner(candidate)) candidate = `${base}-${++n}`;
    return candidate;
  }

  private uniqueCategorySlug(desired: string) {
    const base = desired || "category";
    let candidate = base;
    let n = 1;
    while (this.repository.categories().some((category) => category.slug === candidate))
      candidate = `${base}-${++n}`;
    return candidate;
  }

  private requireAvailableSlug(slug: string, currentPostId?: string) {
    const owner = this.repository.findSlugOwner(slug);
    if (owner && owner !== currentPostId) throw new BlogSlugConflictError();
    return slug;
  }

  private prepare(
    id: string,
    input: {
      title: string;
      slug?: string;
      excerpt: string;
      content: string;
      desired_status: "draft" | "published";
      featured_image_url?: string | null;
      seo_title?: string | null;
      seo_description?: string | null;
      canonical_url?: string | null;
      category_id?: string | null;
      tags?: string[];
    },
    slug: string,
  ): BlogRevisionInput {
    return {
      id,
      slug,
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      desiredStatus: input.desired_status,
      featuredImageUrl: input.featured_image_url ?? null,
      seoTitle: input.seo_title ?? null,
      seoDescription: input.seo_description ?? null,
      canonicalUrl: input.canonical_url ?? null,
      categoryId: input.category_id ?? null,
      tags: [...new Set((input.tags ?? []).map(normalize).filter(Boolean))],
    };
  }

  private requireCategory(categoryId: string | null | undefined) {
    if (categoryId && !this.repository.categories().some((category) => category.id === categoryId))
      throw new BlogCategoryNotFoundError();
  }

  private ensureCategoryValuesAvailable(name: string, slug: string, exceptId?: string) {
    const categories = this.repository.categories().filter((category) => category.id !== exceptId);
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase()))
      throw new BlogCategoryConflictError("name");
    if (categories.some((category) => category.slug === slug))
      throw new BlogCategoryConflictError("slug");
  }
}

function hashRequest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function slugBase(value: string) {
  return slugify(value, { lower: true, strict: true, trim: true }) || "post";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
