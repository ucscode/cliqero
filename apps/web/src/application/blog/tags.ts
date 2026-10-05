import { newId } from "@/kernel/ids";
import slugify from "slugify";
import { CrudService } from "@/kernel/crud";
import {
  blogCategoryNameSchema,
  blogCategorySlugSchema,
  BlogTagConflictError,
  type BlogTagRecord,
  type BlogTagRepository,
} from "@/modules/blog/domain/blog";

export class BlogTagService extends CrudService<
  [input: { name: string; slug?: string }],
  [id: string],
  [id: string, input: { name?: string; slug?: string }],
  [id: string],
  BlogTagRecord,
  BlogTagRecord | null,
  BlogTagRecord | null,
  void
> {
  constructor(private readonly repository: BlogTagRepository) {
    super();
  }

  override create(input: { name: string; slug?: string }) {
    const name = blogCategoryNameSchema.parse(input.name);
    const slug = blogCategorySlugSchema.parse(
      input.slug ?? slugify(name, { lower: true, strict: true, trim: true }),
    );
    this.assertUnique(slug, name);
    const record = { id: newId(), name, slug };
    return this.repository.create(record);
  }

  override get(id: string) {
    return this.repository.findById(id);
  }

  override update(id: string, input: { name?: string; slug?: string }) {
    const patch = {
      ...(input.name !== undefined ? { name: blogCategoryNameSchema.parse(input.name) } : {}),
      ...(input.slug !== undefined ? { slug: blogCategorySlugSchema.parse(input.slug) } : {}),
    };
    const current = this.repository.findById(id);
    if (!current) return null;
    this.assertUnique(patch.slug ?? current.slug, patch.name ?? current.name, id);
    return this.repository.update(id, patch);
  }

  override delete(id: string) {
    return this.repository.delete(id);
  }

  list() {
    return this.repository.list();
  }

  private assertUnique(slug: string, name: string, exceptId?: string) {
    const conflict = this.repository
      .list()
      .find(
        (tag) =>
          tag.id !== exceptId &&
          (tag.slug === slug || tag.name.toLocaleLowerCase() === name.toLocaleLowerCase()),
      );
    if (conflict) throw new BlogTagConflictError(conflict.slug === slug ? "slug" : "name");
  }
}
