import type Database from "better-sqlite3";
import {
  BlogTagConflictError,
  BlogTagRepository,
  type BlogTagRecord,
} from "@/modules/blog/domain/blog";

export class SqliteBlogTagRepository extends BlogTagRepository {
  constructor(private readonly db: Database.Database) {
    super();
  }

  create(input: BlogTagRecord) {
    try {
      this.db
        .prepare("insert into blog_tags(id,slug,name) values(?,?,?)")
        .run(input.id, input.slug, input.name);
    } catch (error) {
      this.throwConflict(error);
    }
    return input;
  }

  findById(id: string) {
    return (
      (this.db.prepare("select id,slug,name from blog_tags where id=?").get(id) as
        BlogTagRecord | undefined) ?? null
    );
  }

  get(id: string) {
    return this.findById(id);
  }

  update(id: string, input: Partial<Pick<BlogTagRecord, "slug" | "name">>) {
    const current = this.findById(id);
    if (!current) return null;
    const next = { ...current, ...input };
    try {
      this.db
        .prepare("update blog_tags set slug=?,name=? where id=?")
        .run(next.slug, next.name, id);
    } catch (error) {
      this.throwConflict(error);
    }
    return next;
  }

  delete(id: string) {
    this.db.prepare("delete from blog_tags where id=?").run(id);
  }

  list() {
    return this.db
      .prepare("select id,slug,name from blog_tags order by name")
      .all() as BlogTagRecord[];
  }

  private throwConflict(error: unknown): never {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("blog_tags.slug")) throw new BlogTagConflictError("slug");
    if (message.includes("blog_tags.name")) throw new BlogTagConflictError("name");
    throw error;
  }
}
