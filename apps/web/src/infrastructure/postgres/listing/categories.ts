import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  ListingCategoryInput,
  ListingCategoryRepository,
} from "@/modules/listing/category/category";
import {
  ListingCategoryConflictError,
  ListingCategoryInUseError,
} from "@/modules/listing/category/category";

type CategoryRow = { id: string; name: string; slug: string };

export class PostgresListingCategoryRepository implements ListingCategoryRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async list() {
    return (
      await this.sql.query<CategoryRow>(
        'select uuid as id,name,slug from listing_capability.categories order by lower(name) collate "C",id',
      )
    ).rows;
  }

  async findByIds(ids: readonly string[]) {
    if (!ids.length) return [];
    return (
      await this.sql.query<CategoryRow>(
        'select uuid as id,name,slug from listing_capability.categories where uuid=any($1::uuid[]) order by lower(name) collate "C",id',
        [ids],
      )
    ).rows;
  }

  async findById(id: string) {
    return (
      (
        await this.sql.query<CategoryRow>(
          "select uuid as id,name,slug from listing_capability.categories where uuid=$1",
          [id],
        )
      ).rows[0] ?? null
    );
  }

  async create(input: { name: string; slug: string }) {
    try {
      return (
        await this.sql.query<CategoryRow>(
          "insert into listing_capability.categories(name,slug) values($1,$2) returning uuid as id,name,slug",
          [input.name, input.slug],
        )
      ).rows[0]!;
    } catch (error) {
      throwCategoryConflict(error);
    }
  }

  async update(id: string, input: ListingCategoryInput) {
    try {
      return (
        (
          await this.sql.query<CategoryRow>(
            "update listing_capability.categories set name=coalesce($2,name),slug=coalesce($3,slug),updated_at=now() where uuid=$1 returning uuid as id,name,slug",
            [id, input.name ?? null, input.slug ?? null],
          )
        ).rows[0] ?? null
      );
    } catch (error) {
      throwCategoryConflict(error);
    }
  }

  async delete(id: string) {
    try {
      await this.sql.query("delete from listing_capability.categories where uuid=$1", [id]);
    } catch (error) {
      if (isPostgresError(error) && error.code === "23503") throw new ListingCategoryInUseError();
      throw error;
    }
  }

  async removeAssignmentsForRoot(id: string) {
    await this.sql.query(
      `delete from listing_capability.listing_categories
        where category_id=(select id from listing_capability.categories where uuid=$1)`,
      [id],
    );
  }

  async isUsed(id: string) {
    return (
      (
        await this.sql.query(
          "select 1 from listing_capability.listing_categories lc join listing_capability.categories c on c.id=lc.category_id where c.uuid=$1 limit 1",
          [id],
        )
      ).rows.length > 0
    );
  }
}

function isPostgresError(error: unknown): error is { code: string; constraint?: string } {
  return error instanceof Object && "code" in error && typeof error.code === "string";
}

function throwCategoryConflict(error: unknown): never {
  if (isPostgresError(error) && error.code === "23505") {
    throw new ListingCategoryConflictError(
      error.constraint === "listing_categories_name_ci_unique" ? "name" : "slug",
    );
  }
  throw error;
}
