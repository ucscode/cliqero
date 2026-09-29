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
  type BlogCategory,
  type BlogPost,
  type BlogPostInput,
  type BlogRenderablePost,
} from "@/modules/blog/domain/blog";
import type {
  BlogCategoryInput,
  BlogListOptions,
  BlogRepository,
  BlogSaveInput,
} from "@/application/blog/contracts";

const PREVIEW_LIFETIME_MS = 60 * 60 * 1000;
const hashRequest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const slugBase = (value: string) => slugify(value, { lower: true, strict: true, trim: true });
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

export class BlogService {
  constructor(private readonly repository: BlogRepository) {}

  create(input: BlogPostInput, authorAccountId: string | null, idempotencyKey?: string) {
    const parsed = blogPostInputSchema.parse(input);
    const save = this.prepare(parsed);
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
      const id = newId();
      save.slug = parsed.slug
        ? this.requireAvailableSlug(parsed.slug)
        : this.uniqueGeneratedSlug(save.slug);
      this.requireCategories(save.categoryIds);
      const post = this.repository.create(id, save, authorAccountId);
      if (idempotencyKey) this.repository.saveIdempotency(idempotencyKey, requestHash, id);
      return post;
    });
  }

  save(id: string, input: Partial<BlogPostInput>, authorAccountId: string | null) {
    return this.repository.transaction(() => {
      const current = this.repository.get(id);
      if (!current) throw new BlogPostNotFoundError();
      const parsed = blogPostInputSchema.partial().parse(input);
      const merged = {
        title: current.title,
        slug: current.slug,
        excerpt: current.excerpt,
        content: current.content,
        status: current.status,
        featured_image_url: current.featuredImageUrl,
        seo_title: current.seoTitle,
        seo_description: current.seoDescription,
        canonical_url: current.canonicalUrl,
        category_ids: current.categories.map((c) => c.id),
        tags: current.tags.map((t) => t.name),
        ...parsed,
      };
      const result = this.prepare(merged);
      result.slug = parsed.slug ? this.requireAvailableSlug(parsed.slug, id) : current.slug;
      this.requireCategories(result.categoryIds);
      const post = this.repository.save(id, result, authorAccountId);
      if (!post) throw new BlogPostNotFoundError();
      return post;
    });
  }

  delete(id: string) {
    if (!this.repository.get(id)) throw new BlogPostNotFoundError();
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

  createPreview(input: BlogPostInput, accountId: string, previewId?: string) {
    const parsed = blogPostInputSchema.parse(input);
    const normalized = this.prepare(parsed);
    normalized.slug = parsed.slug ?? (slugBase(parsed.title) || "preview");
    this.requireCategories(normalized.categoryIds);
    const id = previewId ?? newId();
    const now = Date.now();
    const payload: BlogRenderablePost = {
      title: normalized.title,
      slug: normalized.slug,
      excerpt: normalized.excerpt,
      content: normalized.content,
      featuredImageUrl: normalized.featuredImageUrl,
      seoTitle: normalized.seoTitle,
      seoDescription: normalized.seoDescription,
      canonicalUrl: normalized.canonicalUrl,
      categories: this.repository.categories().filter((c) => normalized.categoryIds.includes(c.id)),
      tags: normalized.tags.map((name) => ({ name, slug: slugBase(name) })),
    };
    this.repository.savePreview(id, accountId, payload, now, now + PREVIEW_LIFETIME_MS);
    return { id, url: `/blog/preview/${encodeURIComponent(id)}` };
  }
  getPreview(id: string, accountId: string) {
    return this.repository.getPreview(id, accountId, Date.now());
  }
  deletePreview(id: string, accountId: string) {
    this.repository.deletePreview(id, accountId);
  }

  createCategory(name: string, suppliedSlug?: string): BlogCategory {
    return this.repository.transaction(() => {
      const normalized = blogCategoryNameSchema.parse(name);
      const slug =
        suppliedSlug === undefined || suppliedSlug.trim() === ""
          ? this.uniqueCategorySlug(slugBase(normalized) || "category")
          : blogCategorySlugSchema.parse(suppliedSlug);
      this.ensureCategoryValuesAvailable(normalized, slug);
      return this.repository.createCategory({ name: normalized, slug });
    });
  }
  updateCategory(id: string, input: BlogCategoryInput): BlogCategory {
    return this.repository.transaction(() => {
      const current = this.repository.categories().find((c) => c.id === id);
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
    if (!this.repository.categories().some((c) => c.id === id))
      throw new BlogCategoryNotFoundError();
    if (this.repository.categoryIsUsed(id)) throw new BlogCategoryInUseError();
    this.repository.deleteCategory(id);
  }

  private prepare(input: BlogPostInput): BlogSaveInput {
    return {
      slug: input.slug ?? (slugBase(input.title) || "post"),
      title: input.title,
      excerpt: input.excerpt ?? "",
      content: input.content,
      status: input.status ?? "draft",
      featuredImageUrl: input.featured_image_url ?? null,
      seoTitle: input.seo_title ?? null,
      seoDescription: input.seo_description ?? null,
      canonicalUrl: input.canonical_url ?? null,
      categoryIds: [...new Set(input.category_ids ?? [])],
      tags: [...new Set((input.tags ?? []).map(normalize).filter(Boolean))],
    };
  }
  private requireCategories(ids: string[]) {
    const available = new Set(this.repository.categories().map((c) => c.id));
    if (ids.some((id) => !available.has(id))) throw new BlogCategoryNotFoundError();
  }
  private uniqueGeneratedSlug(base: string) {
    let candidate = base || "post",
      n = 1;
    while (this.repository.findSlugOwner(candidate)) candidate = `${base || "post"}-${++n}`;
    return candidate;
  }
  private uniqueCategorySlug(base: string) {
    let candidate = base,
      n = 1;
    while (this.repository.categories().some((c) => c.slug === candidate))
      candidate = `${base}-${++n}`;
    return candidate;
  }
  private requireAvailableSlug(slug: string, exceptId?: string) {
    const owner = this.repository.findSlugOwner(slug);
    if (owner && owner !== exceptId) throw new BlogSlugConflictError();
    return slug;
  }
  private ensureCategoryValuesAvailable(name: string, slug: string, exceptId?: string) {
    const existing = this.repository.categories().filter((c) => c.id !== exceptId);
    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      throw new BlogCategoryConflictError("name");
    if (existing.some((c) => c.slug === slug)) throw new BlogCategoryConflictError("slug");
  }
}
