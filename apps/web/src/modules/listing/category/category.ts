import { z } from "zod";
import { PublicApplicationError } from "@/kernel/errors";

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

export interface ListingCategoryRepository {
  list(): Promise<readonly ListingCategory[]>;
  findByIds(ids: readonly string[]): Promise<readonly ListingCategory[]>;
  findById(id: string): Promise<ListingCategory | null>;
  create(input: { name: string; slug: string }): Promise<ListingCategory>;
  update(id: string, input: ListingCategoryInput): Promise<ListingCategory | null>;
  delete(id: string): Promise<void>;
  removeAssignmentsForRoot(id: string): Promise<void>;
  isUsed(id: string): Promise<boolean>;
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
