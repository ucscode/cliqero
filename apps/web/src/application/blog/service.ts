import { createHash } from "node:crypto";
import slugify from "slugify";
import { newId } from "@/kernel/ids";
import { CrudService } from "@/kernel/crud";
import { BlogCategoryService } from "./categories";
import { BlogTagService } from "./tags";
import {
  blogPostInputSchema,
  BlogCategoryNotFoundError,
  BlogPostNotFoundError,
  BlogSlugConflictError,
  type BlogPost,
  type BlogPostInput,
  type BlogRenderablePost,
} from "@/modules/blog/domain/blog";
import type { BlogListOptions, BlogRepository, BlogSaveInput } from "@/application/blog/contracts";

const PREVIEW_LIFETIME_MS = 60 * 60 * 1000;
const hashRequest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const slugBase = (value: string) => slugify(value, { lower: true, strict: true, trim: true });
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

export class BlogService extends CrudService<
  [input: BlogPostInput, authorAccountId: string | null, idempotencyKey?: string],
  [idOrSlug: string, publishedOnly?: boolean],
  [id: string, input: Partial<BlogPostInput>, authorAccountId: string | null],
  [id: string],
  BlogPost,
  BlogPost | null,
  BlogPost,
  void
> {
  readonly categoryService: BlogCategoryService;
  readonly tagService: BlogTagService;

  constructor(private readonly repository: BlogRepository) {
    super();
    this.categoryService = new BlogCategoryService(repository.categoryRepository);
    this.tagService = new BlogTagService(repository.tagRepository);
  }

  override create(
    input: BlogPostInput,
    authorAccountId: string | null,
    idempotencyKey?: string,
  ): BlogPost {
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
      this.repository.syncFeaturedMedia(post.id, authorAccountId, post.featuredImageUrl);
      if (idempotencyKey) this.repository.saveIdempotency(idempotencyKey, requestHash, id);
      return post;
    });
  }

  override update(
    id: string,
    input: Partial<BlogPostInput>,
    authorAccountId: string | null,
  ): BlogPost {
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
      const post = this.repository.update(id, result, authorAccountId);
      if (!post) throw new BlogPostNotFoundError();
      this.repository.syncFeaturedMedia(post.id, authorAccountId, post.featuredImageUrl);
      return post;
    });
  }

  override delete(id: string) {
    if (!this.repository.get(id)) throw new BlogPostNotFoundError();
    this.repository.transaction(() => {
      this.repository.markFeaturedMediaForDeletion(id);
      this.repository.delete(id);
    });
  }
  override get(idOrSlug: string, publishedOnly = false): BlogPost | null {
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
  private requireAvailableSlug(slug: string, exceptId?: string) {
    const owner = this.repository.findSlugOwner(slug);
    if (owner && owner !== exceptId) throw new BlogSlugConflictError();
    return slug;
  }
}
