import type Database from "better-sqlite3";
import { newId } from "@/kernel/ids";
import {
  BlogCategoryConflictError,
  BlogCategoryInUseError,
  type BlogCategory,
  BlogCategoryRepository,
} from "@/modules/blog/domain/blog";

export class SqliteBlogCategoryRepository extends BlogCategoryRepository {
  constructor(private readonly db: Database.Database) {
    super();
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  list(): BlogCategory[] {
    return this.db
      .prepare("select id,slug,name from blog_categories order by name")
      .all() as BlogCategory[];
  }

  findById(id: string): BlogCategory | null {
    return (
      (this.db.prepare("select id,slug,name from blog_categories where id=?").get(id) as
        BlogCategory | undefined) ?? null
    );
  }

  create(input: { name: string; slug: string }): BlogCategory {
    const id = newId();
    try {
      this.db
        .prepare("insert into blog_categories(id,slug,name) values(?,?,?)")
        .run(id, input.slug, input.name);
    } catch (error) {
      this.throwConflict(error);
    }
    return { id, ...input };
  }

  update(id: string, input: { name?: string; slug?: string }): BlogCategory | null {
    const current = this.findById(id);
    if (!current) return null;
    const next = { name: input.name ?? current.name, slug: input.slug ?? current.slug };
    try {
      this.db
        .prepare("update blog_categories set name=?,slug=? where id=?")
        .run(next.name, next.slug, id);
    } catch (error) {
      this.throwConflict(error);
    }
    return { id, ...next };
  }

  delete(id: string): void {
    try {
      this.db.prepare("delete from blog_categories where id=?").run(id);
    } catch (error) {
      if (error instanceof Error && error.message.includes("FOREIGN KEY constraint failed"))
        throw new BlogCategoryInUseError();
      throw error;
    }
  }

  deleteForRoot(id: string): void {
    this.db.transaction(() => {
      this.db.prepare("delete from blog_post_categories where category_id=?").run(id);
      if (!this.db.prepare("delete from blog_categories where id=?").run(id).changes)
        throw new Error("Blog category not found");
    })();
  }

  isUsed(id: string): boolean {
    return Boolean(
      this.db.prepare("select 1 from blog_post_categories where category_id=? limit 1").get(id),
    );
  }

  private throwConflict(error: unknown): never {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("blog_categories.name")) throw new BlogCategoryConflictError("name");
    if (message.includes("blog_categories.slug")) throw new BlogCategoryConflictError("slug");
    throw error;
  }
}
