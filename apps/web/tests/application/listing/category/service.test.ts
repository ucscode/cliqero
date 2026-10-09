import { describe, expect, it, vi } from "vitest";
import { ListingCategoryService } from "@/application/listing/category/service";
import {
  ListingCategoryConflictError,
  ListingCategoryInUseError,
} from "@/modules/listing/category/category";

function setup() {
  const categories = new Map<string, { id: string; name: string; slug: string }>();
  const repository = {
    list: vi.fn(async () => [...categories.values()].sort((a, b) => a.name.localeCompare(b.name))),
    findByIds: vi.fn(async (ids: readonly string[]) =>
      [...categories.values()].filter((category) => ids.includes(category.id)),
    ),
    findById: vi.fn(async (id: string) => categories.get(id) ?? null),
    create: vi.fn(async (input: { name: string; slug: string }) => {
      const category = {
        id: `00000000-0000-4000-8000-${String(categories.size + 1).padStart(12, "0")}`,
        ...input,
      };
      categories.set(category.id, category);
      return category;
    }),
    update: vi.fn(async (id: string, input: { name?: string; slug?: string }) => {
      const current = categories.get(id);
      if (!current) return null;
      const next = { ...current, ...input };
      categories.set(id, next);
      return next;
    }),
    delete: vi.fn(async (id: string) => {
      categories.delete(id);
    }),
    removeAssignmentsForRoot: vi.fn(async () => undefined),
    isUsed: vi.fn(async () => false),
  };
  const uow = {
    transaction: async <T>(operation: () => Promise<T>) => operation(),
  };
  return { categories, repository, service: new ListingCategoryService(repository, uow) };
}

describe("ListingCategoryService", () => {
  it("generates slugs, accepts explicit slugs, and preserves a slug when renaming", async () => {
    const { service, repository } = setup();
    const generated = await service.create(" Product Research ");
    expect(generated.slug).toBe("product-research");
    const explicit = await service.create("Application Programming Interface", "api");
    expect(explicit.slug).toBe("api");
    expect(await service.update(generated.id, { name: "Product Discovery" })).toMatchObject({
      name: "Product Discovery",
      slug: "product-research",
    });
    expect(repository.update).toHaveBeenCalled();
  });

  it("rejects duplicate names/slugs and invalid explicit slugs", async () => {
    const { service } = setup();
    await service.create("Toolkit", "toolkit");
    await expect(service.create("toolkit", "other")).rejects.toBeInstanceOf(
      ListingCategoryConflictError,
    );
    await expect(service.create("Other", "toolkit")).rejects.toBeInstanceOf(
      ListingCategoryConflictError,
    );
    await expect(service.create("Bad slug", "Bad Slug")).rejects.toThrow();
  });

  it("prevents deletion while a category is assigned", async () => {
    const { service, repository } = setup();
    const category = await service.create("Toolkit");
    repository.isUsed.mockResolvedValue(true);
    await expect(service.delete(category.id)).rejects.toBeInstanceOf(ListingCategoryInUseError);
  });

  it("reads and deletes an unused category", async () => {
    const { service, repository } = setup();
    const category = await service.create("Toolkit");
    await expect(service.get(category.id)).resolves.toEqual(category);
    await service.delete(category.id);
    expect(repository.delete).toHaveBeenCalledWith(category.id);
    await expect(service.get(category.id)).rejects.toThrow("not found");
  });

  it("operator deletion clears assignments, physically deletes, and audits atomically", async () => {
    const { service, repository, categories } = setup();
    const category = await service.create("Assigned category");
    const audit = { record: vi.fn(async () => undefined) };
    const rootService = new ListingCategoryService(
      repository,
      { transaction: async (operation) => operation() },
      audit,
    );

    await rootService.deleteForOperator(category.id, "operator-id");

    expect(repository.removeAssignmentsForRoot).toHaveBeenCalledWith(category.id);
    expect(repository.delete).toHaveBeenCalledWith(category.id);
    expect(categories.has(category.id)).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "operator-id",
        action: "listing_category.deleted",
        subjectType: "catalogue_category",
      }),
    );
  });

  it("validates all category IDs and rejects duplicates", async () => {
    const { service } = setup();
    const category = await service.create("Toolkit");
    expect(await service.requireIds([category.id])).toEqual([category]);
    await expect(service.requireIds([category.id, category.id])).rejects.toThrow("unique");
    await expect(service.requireIds(["00000000-0000-4000-8000-999999999999"])).rejects.toThrow(
      "not found",
    );
    await expect(service.requireIds(["not-a-uuid"])).rejects.toThrow();
  });
});
