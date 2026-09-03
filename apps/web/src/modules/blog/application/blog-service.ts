import { createHash } from "node:crypto";
import slugify from "slugify";
import { newId } from "@/kernel/ids";
import { getBlogDatabase } from "../infrastructure/database";
import { blogPostInputSchema, type BlogPost, type BlogPostInput } from "../domain/blog";

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
function normalize(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
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
function slugBase(title: string) {
  return slugify(title, { lower: true, strict: true, trim: true }) || "post";
}
function requestHash(input: BlogPostInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export class BlogService {
  private readonly db = getBlogDatabase().sqlite;

  private uniqueSlug(desired: string, excludeId?: string) {
    const base = desired || "post";
    let candidate = base;
    let n = 1;
    while (true) {
      const row = this.db.prepare("select id from blog_posts where slug=?").get(candidate) as
        Row | undefined;
      if (!row || row.id === excludeId) return candidate;
      n += 1;
      candidate = `${base}-${n}`;
    }
  }

  create(input: BlogPostInput, authorAccountId: string | null, idempotencyKey?: string) {
    const parsed = blogPostInputSchema.parse(input);
    const hash = requestHash({ ...parsed, author_account_id: authorAccountId });
    const tx = this.db.transaction(() => {
      if (idempotencyKey) {
        const prior = this.db
          .prepare("select * from blog_idempotency where key=?")
          .get(idempotencyKey) as Row | undefined;
        if (prior) {
          if (prior.request_hash !== hash)
            throw new Error("Idempotency key conflicts with a different blog request");
          return this.get(String(prior.post_id));
        }
      }
      const now = Date.now();
      const id = newId();
      const slug = this.uniqueSlug(parsed.slug ?? slugBase(parsed.title));
      const publishedAt = parsed.status === "published" ? now : null;
      const categoryId = this.ensureCategory(parsed.category);
      this.db
        .prepare(
          `insert into blog_posts(id,slug,title,excerpt,content_markdown,status,featured_image_url,author_account_id,seo_title,seo_description,canonical_url,published_at,created_at,updated_at,category_id)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          slug,
          parsed.title,
          parsed.excerpt,
          parsed.content,
          parsed.status,
          parsed.featured_image_url ?? null,
          authorAccountId,
          parsed.seo_title ?? null,
          parsed.seo_description ?? null,
          parsed.canonical_url ?? null,
          publishedAt,
          now,
          now,
          categoryId,
        );
      this.replaceTags(id, parsed.tags ?? []);
      if (idempotencyKey)
        this.db
          .prepare(
            "insert into blog_idempotency(key,request_hash,post_id,created_at) values(?,?,?,?)",
          )
          .run(idempotencyKey, hash, id, now);
      return this.get(id);
    });
    return tx();
  }

  update(id: string, input: Partial<BlogPostInput>) {
    const current = this.get(id);
    if (!current) throw new Error("Blog post not found");
    const parsed = blogPostInputSchema.partial().parse(input);
    const merged = {
      title: current.title,
      excerpt: current.excerpt,
      content: current.content,
      status: current.status,
      slug: current.slug,
      featured_image_url: current.featuredImageUrl,
      seo_title: current.seoTitle,
      seo_description: current.seoDescription,
      canonical_url: current.canonicalUrl,
      category: current.category?.name ?? null,
      tags: current.tags.map((tag) => tag.name),
      ...parsed,
    };
    const now = Date.now();
    const categoryId = this.ensureCategory(merged.category);
    this.db
      .prepare(
        `update blog_posts set title=?,excerpt=?,content_markdown=?,status=?,featured_image_url=?,seo_title=?,seo_description=?,canonical_url=?,published_at=?,updated_at=?,category_id=? where id=?`,
      )
      .run(
        merged.title,
        merged.excerpt,
        merged.content,
        merged.status,
        merged.featured_image_url ?? null,
        merged.seo_title ?? null,
        merged.seo_description ?? null,
        merged.canonical_url ?? null,
        merged.status === "published" ? (current.publishedAt?.getTime() ?? now) : null,
        now,
        categoryId,
        id,
      );
    this.replaceTags(id, merged.tags ?? []);
    return this.get(id);
  }

  publish(id: string, published: boolean) {
    const current = this.get(id);
    if (!current) throw new Error("Blog post not found");
    const now = Date.now();
    this.db
      .prepare("update blog_posts set status=?,published_at=?,updated_at=? where id=?")
      .run(
        published ? "published" : "draft",
        published ? (current.publishedAt?.getTime() ?? now) : null,
        now,
        id,
      );
    return this.get(id);
  }
  delete(id: string) {
    const result = this.db.prepare("delete from blog_posts where id=?").run(id);
    if (!result.changes) throw new Error("Blog post not found");
  }

  get(idOrSlug: string, publishedOnly = false): BlogPost | null {
    const row = this.db
      .prepare(
        `select p.*, c.slug category_slug, c.name category_name from blog_posts p left join blog_categories c on c.id=p.category_id where ${publishedOnly ? "p.status='published' and" : ""} (p.id=? or p.slug=?) limit 1`,
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

  list(
    options: {
      search?: string;
      status?: "draft" | "published";
      category?: string;
      tag?: string;
      cursor?: string;
      limit?: number;
      publishedOnly?: boolean;
    } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
    const where: string[] = [];
    const values: any[] = [];
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
        `select p.*, c.slug category_slug, c.name category_name from blog_posts p left join blog_categories c on c.id=p.category_id ${where.length ? `where ${where.join(" and ")}` : ""} order by p.created_at desc,p.id desc limit ?`,
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
          .all(row.id) as any,
      ),
    );
    const last = selected.at(-1);
    const nextCursor =
      hasMore && last ? Buffer.from(`${last.created_at}|${last.id}`).toString("base64url") : null;
    return { items, nextCursor, limit };
  }
  categories() {
    return this.db.prepare("select id,slug,name from blog_categories order by name").all();
  }
  tags() {
    return this.db.prepare("select id,slug,name from blog_tags order by name").all();
  }
  private ensureCategory(name?: string | null) {
    if (!name?.trim()) return null;
    const normalized = normalize(name);
    const existing = this.db
      .prepare("select id from blog_categories where lower(name)=lower(?)")
      .get(normalized) as Row | undefined;
    if (existing) return existing.id;
    const id = newId();
    this.db
      .prepare("insert into blog_categories(id,slug,name) values(?,?,?)")
      .run(id, this.uniqueTaxonomySlug("blog_categories", normalized), normalized);
    return id;
  }
  private uniqueTaxonomySlug(table: string, name: string) {
    const base = slugBase(name);
    let c = base;
    let n = 1;
    while (this.db.prepare(`select id from ${table} where slug=?`).get(c)) c = `${base}-${++n}`;
    return c;
  }
  private replaceTags(postId: string, names: string[]) {
    this.db.prepare("delete from blog_post_tags where post_id=?").run(postId);
    for (const name of [...new Set(names.map(normalize).filter(Boolean))]) {
      let tag = this.db.prepare("select id from blog_tags where lower(name)=lower(?)").get(name) as
        Row | undefined;
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

let service: BlogService | undefined;
export function getBlogService() {
  return (service ??= new BlogService());
}
