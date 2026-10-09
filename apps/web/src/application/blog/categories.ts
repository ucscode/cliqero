import { CrudService } from "@/kernel/crud";
import {
  blogCategoryNameSchema,
  blogCategorySlugSchema,
  BlogCategoryConflictError,
  BlogCategoryInUseError,
  BlogCategoryNotFoundError,
  type BlogCategory,
} from "@/modules/blog/domain/blog";
import type { BlogCategoryRepository } from "@/modules/blog/domain/blog";
import type { BlogCategoryInput } from "./contracts";
import slugify from "slugify";

const slugBase = (value: string) => slugify(value, { lower: true, strict: true, trim: true });

/** Ordinary CRUD lifecycle for blog categories with audited Operator-side post detachment. */
export class BlogCategoryService extends CrudService<
  [name: string, suppliedSlug?: string],
  [id: string],
  [id: string, input: BlogCategoryInput],
  [id: string],
  BlogCategory,
  BlogCategory,
  BlogCategory,
  void
> {
  constructor(private readonly repository: BlogCategoryRepository) {
    super();
  }

  override create(name: string, suppliedSlug?: string): BlogCategory {
    return this.repository.transaction(() => {
      const normalized = blogCategoryNameSchema.parse(name);
      const slug = suppliedSlug?.trim()
        ? blogCategorySlugSchema.parse(suppliedSlug)
        : this.uniqueSlug(slugBase(normalized) || "category");
      this.ensureAvailable(normalized, slug);
      return this.repository.create({ name: normalized, slug });
    });
  }

  override get(id: string): BlogCategory {
    const category = this.repository.findById(id);
    if (!category) throw new BlogCategoryNotFoundError();
    return category;
  }

  override update(id: string, input: BlogCategoryInput): BlogCategory {
    return this.repository.transaction(() => {
      const current = this.get(id);
      const name =
        input.name === undefined ? current.name : blogCategoryNameSchema.parse(input.name);
      const slug =
        input.slug === undefined ? current.slug : blogCategorySlugSchema.parse(input.slug);
      this.ensureAvailable(name, slug, id);
      const updated = this.repository.update(id, { name, slug });
      if (!updated) throw new BlogCategoryNotFoundError();
      return updated;
    });
  }

  override delete(id: string): void {
    this.get(id);
    if (this.repository.isUsed(id)) throw new BlogCategoryInUseError();
    this.repository.delete(id);
  }

  deleteForOperator(id: string): void {
    this.get(id);
    this.repository.deleteWithPosts(id);
  }

  private uniqueSlug(base: string) {
    let candidate = base;
    let suffix = 1;
    while (this.repository.list().some((category) => category.slug === candidate))
      candidate = `${base}-${++suffix}`;
    return candidate;
  }

  private ensureAvailable(name: string, slug: string, exceptId?: string) {
    const existing = this.repository.list().filter((category) => category.id !== exceptId);
    if (existing.some((category) => category.name.toLowerCase() === name.toLowerCase()))
      throw new BlogCategoryConflictError("name");
    if (existing.some((category) => category.slug === slug))
      throw new BlogCategoryConflictError("slug");
  }
}
