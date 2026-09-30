import type Database from "better-sqlite3";
import slugify from "slugify";
import { newId } from "@/kernel/ids";
import {
  blogRenderablePostSchema,
  BlogCategoryConflictError,
  BlogCategoryInUseError,
  type BlogCategory,
  type BlogPost,
  type BlogRenderablePost,
} from "@/modules/blog/domain/blog";
import type {
  BlogCategoryInput,
  BlogListOptions,
  BlogPreview,
  BlogRepository,
  BlogSaveInput,
} from "@/application/blog/contracts";
import { PublicApplicationError } from "@/kernel/errors";

type Row = Record<string, any>;
function decodeSortCursor(token: string | undefined, sort: string, direction: string) {
  if (!token) return null;
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      decoded.sort !== sort ||
      decoded.direction !== direction ||
      typeof decoded.value !== "string" ||
      typeof decoded.id !== "string" ||
      !decoded.id
    )
      throw new Error();
    return { value: decoded.value, id: decoded.id };
  } catch {
    throw new PublicApplicationError("Invalid or stale pagination cursor", "invalid_cursor", 400);
  }
}
const date = (value: number | null | undefined) => (value == null ? null : new Date(Number(value)));

export class SqliteBlogRepository implements BlogRepository {
  constructor(private readonly db: Database.Database) {}
  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  findIdempotency(key: string) {
    const row = this.db
      .prepare("select request_hash,post_id from blog_idempotency where key=?")
      .get(key) as { request_hash: string; post_id: string } | undefined;
    return row ? { requestHash: row.request_hash, postId: row.post_id } : null;
  }
  saveIdempotency(key: string, requestHash: string, postId: string) {
    this.db
      .prepare("insert into blog_idempotency(key,request_hash,post_id,created_at) values(?,?,?,?)")
      .run(key, requestHash, postId, Date.now());
  }
  findSlugOwner(slug: string) {
    const row = this.db.prepare("select id from blog_posts where slug=? limit 1").get(slug) as
      { id: string } | undefined;
    return row?.id ?? null;
  }
  create(id: string, input: BlogSaveInput, authorAccountId: string | null) {
    const now = Date.now();
    this.db
      .prepare(
        `insert into blog_posts(
      id,slug,title,excerpt,content_markdown,status,featured_image_url,author_account_id,
      seo_title,seo_description,canonical_url,published_at,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.slug,
        input.title,
        input.excerpt,
        input.content,
        input.status,
        input.featuredImageUrl,
        authorAccountId,
        input.seoTitle,
        input.seoDescription,
        input.canonicalUrl,
        input.status === "published" ? now : null,
        now,
        now,
      );
    this.replaceRelations(id, input);
    return this.get(id)!;
  }
  save(id: string, input: BlogSaveInput, authorAccountId: string | null): BlogPost | null {
    const current = this.get(id);
    if (!current) return null;
    const now = Date.now();
    this.db
      .prepare(
        `update blog_posts set slug=?,title=?,excerpt=?,content_markdown=?,status=?,
      featured_image_url=?,author_account_id=?,seo_title=?,seo_description=?,canonical_url=?,
      published_at=case when ?='published' then coalesce(published_at,?) else null end,updated_at=?
      where id=?`,
      )
      .run(
        input.slug,
        input.title,
        input.excerpt,
        input.content,
        input.status,
        input.featuredImageUrl,
        authorAccountId,
        input.seoTitle,
        input.seoDescription,
        input.canonicalUrl,
        input.status,
        now,
        now,
        id,
      );
    this.replaceRelations(id, input);
    return this.get(id);
  }
  delete(id: string) {
    if (!this.db.prepare("delete from blog_posts where id=?").run(id).changes)
      throw new Error("Blog post not found");
  }
  get(idOrSlug: string, publishedOnly = false): BlogPost | null {
    const row = this.db
      .prepare(
        `select * from blog_posts where (id=? or slug=?) ${publishedOnly ? "and status='published'" : ""} limit 1`,
      )
      .get(idOrSlug, idOrSlug) as Row | undefined;
    return row ? this.mapPost(row) : null;
  }
  list(options: BlogListOptions = {}) {
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
    const where: string[] = [];
    const values: unknown[] = [];
    if (options.publishedOnly) where.push("p.status='published'");
    else if (options.status) {
      where.push("p.status=?");
      values.push(options.status);
    }
    if (options.search) {
      where.push(
        "(lower(p.title) like lower(?) or lower(p.excerpt) like lower(?) or p.slug like ?)",
      );
      const q = `%${options.search.trim()}%`;
      values.push(q, q, q);
    }
    if (options.category) {
      where.push(
        "exists(select 1 from blog_post_categories pc join blog_categories c on c.id=pc.category_id where pc.post_id=p.id and c.slug=?)",
      );
      values.push(options.category);
    }
    if (options.tag) {
      where.push(
        "exists(select 1 from blog_post_tags pt join blog_tags t on t.id=pt.tag_id where pt.post_id=p.id and t.slug=?)",
      );
      values.push(options.tag);
    }
    const sort = options.sort ?? "created";
    const direction = options.direction ?? "desc";
    const orderBy = sort === "title" ? "lower(p.title)" : "p.created_at";
    const cursor = decodeSortCursor(options.cursor, sort, direction);
    if (cursor) {
      const comparison = direction === "asc" ? ">" : "<";
      where.push(`(${orderBy} ${comparison} ? or (${orderBy} = ? and p.id ${comparison} ?))`);
      values.push(cursor.value, cursor.value, cursor.id);
    }
    const rows = this.db
      .prepare(
        `select p.*,${orderBy} as cursor_sort_value from blog_posts p ${where.length ? `where ${where.join(" and ")}` : ""}
      order by ${orderBy} ${direction},p.id ${direction} limit ?`,
      )
      .all(...values, limit + 1) as Row[];
    const selected = rows.slice(0, limit);
    const last = selected.at(-1);
    return {
      items: selected.map((row) => this.mapPost(row)),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                sort,
                direction,
                value: String(last.cursor_sort_value),
                id: String(last.id),
              }),
            ).toString("base64url")
          : null,
      limit,
    };
  }
  categories(): BlogCategory[] {
    return this.db
      .prepare("select id,slug,name from blog_categories order by name")
      .all() as BlogCategory[];
  }
  createCategory(input: { name: string; slug: string }): BlogCategory {
    const id = newId();
    try {
      this.db
        .prepare("insert into blog_categories(id,slug,name) values(?,?,?)")
        .run(id, input.slug, input.name);
    } catch (error) {
      this.throwCategoryConflict(error);
    }
    return { id, ...input };
  }
  updateCategory(id: string, input: BlogCategoryInput): BlogCategory | null {
    const current = this.db
      .prepare("select id,slug,name from blog_categories where id=?")
      .get(id) as BlogCategory | undefined;
    if (!current) return null;
    const next = { name: input.name ?? current.name, slug: input.slug ?? current.slug };
    try {
      this.db
        .prepare("update blog_categories set name=?,slug=? where id=?")
        .run(next.name, next.slug, id);
    } catch (error) {
      this.throwCategoryConflict(error);
    }
    return { id, ...next };
  }
  deleteCategory(id: string) {
    try {
      this.db.prepare("delete from blog_categories where id=?").run(id);
    } catch (error) {
      if (error instanceof Error && error.message.includes("FOREIGN KEY constraint failed"))
        throw new BlogCategoryInUseError();
      throw error;
    }
  }
  categoryIsUsed(id: string) {
    return Boolean(
      this.db.prepare("select 1 from blog_post_categories where category_id=? limit 1").get(id),
    );
  }
  tags() {
    return this.db.prepare("select id,slug,name from blog_tags order by name").all();
  }
  savePreview(
    id: string,
    accountId: string,
    payload: BlogRenderablePost,
    now: number,
    expiresAt: number,
  ) {
    this.clearExpiredPreviews(now);
    this.db
      .prepare(
        `insert into blog_previews(id,account_id,payload_json,created_at,updated_at,expires_at)
      values(?,?,?,?,?,?) on conflict(id) do update set payload_json=excluded.payload_json,
      updated_at=excluded.updated_at,expires_at=excluded.expires_at where blog_previews.account_id=excluded.account_id`,
      )
      .run(id, accountId, JSON.stringify(payload), now, now, expiresAt);
  }
  getPreview(id: string, accountId: string, now: number): BlogPreview | null {
    this.clearExpiredPreviews(now);
    const row = this.db
      .prepare("select * from blog_previews where id=? and account_id=? and expires_at>? limit 1")
      .get(id, accountId, now) as Row | undefined;
    if (!row) return null;
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      this.deletePreview(id, accountId);
      return null;
    }
    const parsed = blogRenderablePostSchema.safeParse(payload);
    if (!parsed.success) {
      this.deletePreview(id, accountId);
      return null;
    }
    return {
      id: row.id,
      accountId: row.account_id,
      payload: parsed.data,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      expiresAt: new Date(row.expires_at),
    };
  }
  deletePreview(id: string, accountId: string) {
    this.db.prepare("delete from blog_previews where id=? and account_id=?").run(id, accountId);
  }
  clearExpiredPreviews(now: number) {
    this.db.prepare("delete from blog_previews where expires_at<=?").run(now);
  }

  private mapPost(row: Row): BlogPost {
    const categories = this.db
      .prepare(
        `select c.id,c.slug,c.name from blog_post_categories pc join blog_categories c on c.id=pc.category_id where pc.post_id=? order by c.name`,
      )
      .all(row.id) as BlogCategory[];
    const tags = this.db
      .prepare(
        "select t.slug,t.name from blog_post_tags pt join blog_tags t on t.id=pt.tag_id where pt.post_id=? order by t.name",
      )
      .all(row.id) as Array<{ slug: string; name: string }>;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      content: row.content_markdown,
      status: row.status,
      featuredImageUrl: row.featured_image_url ?? null,
      authorAccountId: row.author_account_id ?? null,
      seoTitle: row.seo_title ?? null,
      seoDescription: row.seo_description ?? null,
      canonicalUrl: row.canonical_url ?? null,
      categories,
      tags,
      publishedAt: date(row.published_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
  private replaceRelations(id: string, input: BlogSaveInput) {
    this.db.prepare("delete from blog_post_categories where post_id=?").run(id);
    this.db.prepare("delete from blog_post_tags where post_id=?").run(id);
    const insertCategory = this.db.prepare(
      "insert into blog_post_categories(post_id,category_id) values(?,?)",
    );
    for (const categoryId of input.categoryIds) insertCategory.run(id, categoryId);
    for (const name of input.tags) {
      let tag = this.db.prepare("select id from blog_tags where lower(name)=lower(?)").get(name) as
        { id: string } | undefined;
      if (!tag) {
        const tagId = newId();
        const base = slugify(name, { lower: true, strict: true, trim: true }) || "tag";
        let slug = base;
        let suffix = 1;
        while (this.db.prepare("select id from blog_tags where slug=?").get(slug))
          slug = `${base}-${++suffix}`;
        this.db.prepare("insert into blog_tags(id,slug,name) values(?,?,?)").run(tagId, slug, name);
        tag = { id: tagId };
      }
      this.db.prepare("insert into blog_post_tags(post_id,tag_id) values(?,?)").run(id, tag.id);
    }
  }
  private throwCategoryConflict(error: unknown): never {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("blog_categories.name")) throw new BlogCategoryConflictError("name");
    if (message.includes("blog_categories.slug")) throw new BlogCategoryConflictError("slug");
    throw error;
  }
}
