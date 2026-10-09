import slugify from "slugify";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AuditRecorder } from "@/application/shared/audit";
import { CrudService } from "@/kernel/crud";
import {
  ListingCategoryConflictError,
  ListingCategoryInUseError,
  ListingCategoryNotFoundError,
  listingCategoryIdSchema,
  listingCategoryNameSchema,
  listingCategorySlugSchema,
  type ListingCategory,
  type ListingCategoryInput,
  type ListingCategoryRepository,
} from "@/modules/listing/category/category";

export class ListingCategoryService extends CrudService<
  [name: string, suppliedSlug?: string],
  [id: string],
  [id: string, input: ListingCategoryInput],
  [id: string],
  Promise<ListingCategory>,
  Promise<ListingCategory>,
  Promise<ListingCategory>,
  Promise<void>
> {
  constructor(
    private readonly repository: ListingCategoryRepository,
    private readonly uow: UnitOfWork,
    private readonly audit?: AuditRecorder,
  ) {
    super();
  }

  override create(name: string, suppliedSlug?: string): Promise<ListingCategory> {
    return this.uow.transaction(async () => {
      const normalizedName = listingCategoryNameSchema.parse(name);
      const slug = suppliedSlug?.trim()
        ? listingCategorySlugSchema.parse(suppliedSlug)
        : await this.uniqueSlug(
            slugify(normalizedName, { lower: true, strict: true, trim: true }) || "category",
          );
      await this.ensureAvailable(normalizedName, slug);
      return this.repository.create({ name: normalizedName, slug });
    });
  }

  list() {
    return this.repository.list();
  }

  override async get(id: string) {
    const category = await this.repository.findById(listingCategoryIdSchema.parse(id));
    if (!category) throw new ListingCategoryNotFoundError();
    return category;
  }

  async requireIds(ids: readonly string[]) {
    ids.forEach((id) => listingCategoryIdSchema.parse(id));
    const normalized = [...new Set(ids)];
    if (normalized.length !== ids.length) throw new Error("Category IDs must be unique");
    const categories = await this.repository.findByIds(normalized);
    if (categories.length !== normalized.length) throw new ListingCategoryNotFoundError();
    return categories;
  }

  override update(id: string, input: ListingCategoryInput): Promise<ListingCategory> {
    return this.uow.transaction(async () => {
      const current = await this.repository.findById(id);
      if (!current) throw new ListingCategoryNotFoundError();
      const name =
        input.name === undefined ? current.name : listingCategoryNameSchema.parse(input.name);
      const slug =
        input.slug === undefined ? current.slug : listingCategorySlugSchema.parse(input.slug);
      await this.ensureAvailable(name, slug, id);
      const category = await this.repository.update(id, { name, slug });
      if (!category) throw new ListingCategoryNotFoundError();
      return category;
    });
  }

  override async delete(id: string): Promise<void> {
    return this.uow.transaction(async () => {
      const category = await this.repository.findById(id);
      if (!category) throw new ListingCategoryNotFoundError();
      if (await this.repository.isUsed(id)) throw new ListingCategoryInUseError();
      await this.repository.delete(id);
    });
  }

  async deleteForOperator(id: string, actorId: string) {
    return this.uow.transaction(async () => {
      const category = await this.repository.findById(id);
      if (!category) throw new ListingCategoryNotFoundError();
      await this.repository.removeAssignmentsForRoot(id);
      await this.repository.delete(id);
      await this.audit?.record({
        actorId,
        action: "listing_category.deleted",
        subjectType: "catalogue_category",
        subjectId: id,
        previousState: category,
        newState: { deleted: true, listingAssignmentsRemoved: true },
      });
    });
  }

  private async uniqueSlug(base: string) {
    const existing = new Set((await this.repository.list()).map((category) => category.slug));
    let candidate = base;
    for (let suffix = 2; existing.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;
    return candidate;
  }

  private async ensureAvailable(name: string, slug: string, exceptId?: string) {
    const existing = (await this.repository.list()).filter((category) => category.id !== exceptId);
    if (existing.some((category) => category.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      throw new ListingCategoryConflictError("name");
    if (existing.some((category) => category.slug === slug))
      throw new ListingCategoryConflictError("slug");
  }
}
