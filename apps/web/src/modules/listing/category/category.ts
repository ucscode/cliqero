import { z } from "zod";
import { PublicApplicationError } from "@/kernel/errors";
import { CrudRepository } from "@/kernel/crud";

export const listingCategoryNameSchema = z.string().trim().min(1).max(100);
export const listingCategoryIdSchema = z.uuid();
export const listingCategorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type ListingCategory = Readonly<{ id: string; name: string; slug: string }>;
export type ListingCategoryInput = { name?: string; slug?: string };

export abstract class ListingCategoryRepository extends CrudRepository<
  [input: { name: string; slug: string }],
  [id: string],
  [id: string, input: ListingCategoryInput],
  [id: string],
  Promise<ListingCategory>,
  Promise<ListingCategory | null>,
  Promise<ListingCategory | null>,
  Promise<void>
> {
  abstract list(): Promise<readonly ListingCategory[]>;
  abstract findByIds(ids: readonly string[]): Promise<readonly ListingCategory[]>;
  abstract removeAssignmentsForRoot(id: string): Promise<void>;
  abstract isUsed(id: string): Promise<boolean>;
}

export class ListingCategoryNotFoundError extends PublicApplicationError {
  constructor() {
    super("Catalogue category not found", "not_found", 404);
    this.name = "ListingCategoryNotFoundError";
  }
}

export class ListingCategoryInUseError extends PublicApplicationError {
  constructor() {
    super(
      "This category is assigned to one or more listings. Reassign them before deleting it.",
      "category_in_use",
      409,
    );
    this.name = "ListingCategoryInUseError";
  }
}

export class ListingCategoryConflictError extends PublicApplicationError {
  constructor(readonly field: "name" | "slug") {
    super(
      `A catalogue category with this ${field} already exists.`,
      `category_${field}_conflict`,
      409,
    );
    this.name = "ListingCategoryConflictError";
  }
}
