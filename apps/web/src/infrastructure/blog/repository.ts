import type Database from "better-sqlite3";
import slugify from "slugify";
import { newId } from "@/kernel/ids";
import type { BlogPost } from "@/modules/blog/domain/blog";
import type {
  BlogListOptions,
  BlogPersistenceInput,
  BlogRepository,
} from "@/application/blog/contracts";

type Row = Record<string, any>;

function decodeCursor(value: string | undefined): [number, string] | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8").split("|");
    if (decoded.length !== 2 || !/^\d+$/.test(decoded[0]) || !decoded[1]) return null;
    const timestamp = Number(decoded[0]);
    return Number.isSafeInteger(timestamp) ? [timestamp, decoded[1]] : null;
  } catch {
    return null;
  }
}

function date(value: number | null | undefined) {
  return value == null ? null : new Date(Number(value));
}

function mapPost(row: Row, tags: Array<{ slug: string; name: string }> = []): BlogPost {
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
    publishedAt: date(row.published_at),
    createdAt: new Date(Number(row.created_at)),
    updatedAt: new Date(Number(row.updated_at)),
    category: row.category_slug ? { slug: row.category_slug, name: row.category_name } : null,
    tags,
  };
}

export class SqliteBlogRepository implements BlogRepository {
  constructor(private readonly db: BlogDatabase) {}

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
    const row = this.db.prepare("select id from blog_posts where slug=?").get(slug) as
      | { id: string }
      | undefined;
    return row?.id ?? null;
  }

  create(input: BlogPersistenceInput, authorAccountId: string | null) {
    const now = Date.now();
    const categoryId = this.ensureCategory(input.category);
    this.db
      .prepare(
        `insert into blog_posts(id,slug,title,excerpt,content_markdown,status,featured_image_url,author_account_id,seo_title,seo_description,canonical_url,published_at,created_at,updated_at,category_id)
         values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.id,
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
        input.publishedAt?.getTime() ?? null,
        now,
        now,
        categoryId,
      );
    this.replaceTags(input.id, input.tags);
    return this.get(input.id);
  }

  update(id: string, input: BlogPersistenceInput) {
    const categoryId = this.ensureCategory(input.category);
    const result = this.db
      .prepare(
        `update blog_posts
            set slug=?,title=?,excerpt=?,content_markdown=?,status=?,featured_image_url=?,seo_title=?,seo_description=?,canonical_url=?,published_at=?,updated_at=?,category_id=?
          where id=?`,
      )
      .run(
        input.slug,
        input.title,
        input.excerpt,
        input.content,
        input.status,
        input.featuredImageUrl,
        input.seoTitle,
        input.seoDescription,
        input.canonicalUrl,
        input.publishedAt?.getTime() ?? null,
        Date.now(),
        categoryId,
        id,
      );
    if (!result.changes) return null;
    this.replaceTags(id, input.tags);
    return this.get(id);
  }

  setPublished(id: string, publishedAt: Date | null) {
    const status = publishedAt ? "published" : "draft";
    const result = this.db
      .prepare("update blog_posts set status=?,published_at=?,updated_at=? where id=?")
      .run(status, publishedAt?.getTime() ?? null, Date.now(), id);
    return result.changes ? this.get(id) : null;
  }

  delete(id: string) {
    const result = this.db.prepare("delete from blog_posts where id=?").run(id);
    if (!result.changes) throw new Error("Blog post not found");
  }

  get(idOrSlug: string, publishedOnly = false): BlogPost | null {
    const row = this.db
      .prepare(
        `select p.*, c.slug category_slug, c.name category_name
           from blog_posts p
           left join blog_categories c on c.id=p.category_id
          where ${publishedOnly ? "p.status='published' and" : ""} (p.id=? or p.slug=?) limit 1`,
      )
      .get(idOrSlug, idOrSlug) as Row | undefined;
    if (!row) return null;
    const tags = this.db
      .prepare(
        "select t.slug,t.name from blog_post_tags pt join blog_tags t on t.id=pt.tag_id where pt.post_id=? order by t.name",
      )
      .all(row.id) as Array<{ slug: string; name: string }>;
    return mapPost(row, tags);
  }

  list(options: BlogListOptions = {}) {
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
    const where: string[] = [];
    const values: any[] = [];
    if (options.publishedOnly) where.push("p.status='published'");
    else if (options.status) {
      where.push("p.status=?");
      values.push(options.status);
    }
    if (options.search) {
      where.push("(lower(p.title) like lower(?) or lower(p.excerpt) like lower(?) or p.slug like ?)");
      const q = `%${options.search.trim()}%`;
      values.push(q, q, q);
    }
    if (options.category) {
      where.push("c.slug=?");
      values.push(options.category);
    }
    if (options.tag) {
      where.push(
        "exists (select 1 from blog_post_tags pt2 join blog_tags t2 on t2.id=pt2.tag_id where pt2.post_id=p.id and t2.slug=?)",
      );
      values.push(options.tag);
    }
    const cursor = decodeCursor(options.cursor);
    if (cursor) {
      where.push("(p.created_at < ? or (p.created_at = ? and p.id < ?))");
      values.push(cursor[0], cursor[0], cursor[1]);
    }
    const rows = this.db
      .prepare(
        `select p.*, c.slug category_slug, c.name category_name
           from blog_posts p
           left join blog_categories c on c.id=p.category_id
          ${where.length ? `where ${where.join(" and ")}` : ""}
          order by p.created_at desc,p.id desc limit ?`,
      )
      .all(...values, limit + 1) as Row[];
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const items = selected.map((row) =>
      mapPost(
        row,
        this.db
          .prepare(
            "select t.slug,t.name from blog_post_tags pt join blog_tags t on t.id=pt.tag_id where pt.post_id=? order by t.name",
          )
          .all(row.id) as Array<{ slug: string; name: string }>,
      ),
    );
    const last = selected.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last ? Buffer.from(`${last.created_at}|${last.id}`).toString("base64url") : null,
      limit,
    };
  }

  categories() {
    return this.db.prepare("select id,slug,name from blog_categories order by name").all();
  }

  tags() {
    return this.db.prepare("select id,slug,name from blog_tags order by name").all();
  }

  private ensureCategory(name: string | null) {
    if (!name) return null;
    const existing = this.db
      .prepare("select id from blog_categories where lower(name)=lower(?)")
      .get(name) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = newId();
    this.db
      .prepare("insert into blog_categories(id,slug,name) values(?,?,?)")
      .run(id, this.uniqueTaxonomySlug("blog_categories", name), name);
    return id;
  }

  private uniqueTaxonomySlug(table: "blog_categories" | "blog_tags", name: string) {
    const base = slugify(name, { lower: true, strict: true, trim: true }) || "item";
    let candidate = base;
    let n = 1;
    while (this.db.prepare(`select id from ${table} where slug=?`).get(candidate))
      candidate = `${base}-${++n}`;
    return candidate;
  }

  private replaceTags(postId: string, names: string[]) {
    this.db.prepare("delete from blog_post_tags where post_id=?").run(postId);
    for (const name of names) {
      let tag = this.db.prepare("select id from blog_tags where lower(name)=lower(?)").get(name) as
        | { id: string }
        | undefined;
      if (!tag) {
        const id = newId();
        this.db
          .prepare("insert into blog_tags(id,slug,name) values(?,?,?)")
          .run(id, this.uniqueTaxonomySlug("blog_tags", name), name);
        tag = { id };
      }
      this.db
        .prepare("insert or ignore into blog_post_tags(post_id,tag_id) values(?,?)")
        .run(postId, tag.id);
    }
  }
}

export type BlogDatabase = Database.Database;
