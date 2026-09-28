import type Database from "better-sqlite3";
import slugify from "slugify";
import { newId } from "@/kernel/ids";
import {
  BlogCategoryConflictError,
  BlogCategoryInUseError,
  type BlogCategory,
  type BlogPost,
} from "@/modules/blog/domain/blog";
import type {
  BlogCategoryInput,
  BlogListOptions,
  BlogRepository,
  BlogRevisionInput,
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

const date = (value: number | null | undefined) => (value == null ? null : new Date(Number(value)));

function mapPost(row: Row, tags: Array<{ slug: string; name: string }>): BlogPost {
  return {
    id: row.post_id,
    revisionId: row.revision_id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content_markdown,
    desiredStatus: row.desired_status,
    publicationStatus: row.publication_state,
    hasWorkingRevision: row.working_revision_id != null,
    workingRevisionUpdatedAt: date(row.working_updated_at),
    featuredImageUrl: row.featured_image_url ?? null,
    authorAccountId: row.author_account_id ?? null,
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
    canonicalUrl: row.canonical_url ?? null,
    publishedAt: date(row.published_at),
    createdAt: new Date(Number(row.created_at)),
    updatedAt: new Date(Number(row.revision_updated_at)),
    category: row.category_slug
      ? { id: row.category_id, slug: row.category_slug, name: row.category_name }
      : null,
    tags,
  };
}

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
    const row = this.db
      .prepare(
        `select p.id from blog_posts p
         join blog_post_revisions r on r.id in (p.working_revision_id, p.published_revision_id)
         where r.slug=? limit 1`,
      )
      .get(slug) as { id: string } | undefined;
    return row?.id ?? null;
  }

  create(postId: string, input: BlogRevisionInput, authorAccountId: string | null) {
    const now = Date.now();
    this.db
      .prepare(
        `insert into blog_posts(id, publication_state, author_account_id, published_at, created_at, updated_at)
         values(?, 'draft', ?, null, ?, ?)`,
      )
      .run(postId, authorAccountId, now, now);
    this.insertRevision(postId, input, authorAccountId, 1, now);
    this.db
      .prepare("update blog_posts set working_revision_id=?, updated_at=? where id=?")
      .run(input.id, now, postId);
    return this.get(postId);
  }

  saveRevision(postId: string, input: BlogRevisionInput, authorAccountId: string | null) {
    const post = this.db.prepare("select id from blog_posts where id=?").get(postId);
    if (!post) return null;
    const revisionNumber = this.db
      .prepare(
        "select coalesce(max(revision_number), 0) + 1 n from blog_post_revisions where post_id=?",
      )
      .get(postId) as { n: number };
    const now = Date.now();
    this.insertRevision(postId, input, authorAccountId, revisionNumber.n, now);
    this.db
      .prepare("update blog_posts set working_revision_id=?, updated_at=? where id=?")
      .run(input.id, now, postId);
    return this.get(postId);
  }

  applyPublication(id: string, desiredStatus: "draft" | "published") {
    const now = Date.now();
    const result =
      desiredStatus === "published"
        ? this.db
            .prepare(
              `update blog_posts
                 set publication_state='published',
                     published_revision_id=coalesce(working_revision_id, published_revision_id),
                     working_revision_id=null,
                     published_at=coalesce(published_at, ?), updated_at=?
               where id=? and coalesce(working_revision_id, published_revision_id) is not null`,
            )
            .run(now, now, id)
        : this.db
            .prepare("update blog_posts set publication_state='draft', updated_at=? where id=?")
            .run(now, id);
    if (!result.changes) return this.get(id);
    return this.get(id);
  }

  delete(id: string) {
    const result = this.db.prepare("delete from blog_posts where id=?").run(id);
    if (!result.changes) throw new Error("Blog post not found");
  }

  get(idOrSlug: string, publishedOnly = false): BlogPost | null {
    const revisionJoin = publishedOnly
      ? "r.id=p.published_revision_id and p.publication_state='published'"
      : "r.id=coalesce(p.working_revision_id, p.published_revision_id)";
    const row = this.db
      .prepare(
        `select p.id post_id, r.id revision_id, r.slug, r.title, r.excerpt, r.content_markdown,
                r.desired_status, r.featured_image_url, r.seo_title, r.seo_description,
                r.canonical_url, r.category_id, p.author_account_id, p.publication_state,
                p.working_revision_id, p.published_at, p.created_at, r.updated_at revision_updated_at,
                wr.updated_at working_updated_at, c.slug category_slug, c.name category_name
           from blog_posts p join blog_post_revisions r on ${revisionJoin}
           left join blog_post_revisions wr on wr.id=p.working_revision_id
           left join blog_categories c on c.id=r.category_id
          where p.id=? or r.slug=? limit 1`,
      )
      .get(idOrSlug, idOrSlug) as Row | undefined;
    return row ? mapPost(row, this.revisionTags(row.revision_id)) : null;
  }

  getWorkingRevision(id: string) {
    const row = this.revisionRow(`p.id=? and p.working_revision_id=r.id`, id);
    return row ? mapPost(row, this.revisionTags(row.revision_id)) : null;
  }

  getRevision(id: string, revisionId: string) {
    const row = this.revisionRow("p.id=? and r.id=?", id, revisionId);
    return row ? mapPost(row, this.revisionTags(row.revision_id)) : null;
  }

  list(options: BlogListOptions = {}) {
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
    const isPublic = Boolean(options.publishedOnly);
    const revisionJoin = isPublic
      ? "r.id=p.published_revision_id and p.publication_state='published'"
      : "r.id=coalesce(p.working_revision_id, p.published_revision_id)";
    const where: string[] = [];
    const values: unknown[] = [];
    if (!isPublic && options.status) {
      where.push("p.publication_state=?");
      values.push(options.status);
    }
    if (options.search) {
      where.push(
        "(lower(r.title) like lower(?) or lower(r.excerpt) like lower(?) or r.slug like ?)",
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
        "exists (select 1 from blog_post_revision_tags rt2 join blog_tags t2 on t2.id=rt2.tag_id where rt2.revision_id=r.id and t2.slug=?)",
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
        `select p.id post_id, r.id revision_id, r.slug, r.title, r.excerpt, r.content_markdown,
                r.desired_status, r.featured_image_url, r.seo_title, r.seo_description,
                r.canonical_url, r.category_id, p.author_account_id, p.publication_state,
                p.working_revision_id, p.published_at, p.created_at, r.updated_at revision_updated_at,
                wr.updated_at working_updated_at, c.slug category_slug, c.name category_name
           from blog_posts p join blog_post_revisions r on ${revisionJoin}
           left join blog_post_revisions wr on wr.id=p.working_revision_id
           left join blog_categories c on c.id=r.category_id
          ${where.length ? `where ${where.join(" and ")}` : ""}
          order by p.created_at desc,p.id desc limit ?`,
      )
      .all(...values, limit + 1) as Row[];
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const items = selected.map((row) => mapPost(row, this.revisionTags(row.revision_id)));
    const last = selected.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? Buffer.from(`${last.created_at}|${last.post_id}`).toString("base64url")
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

  deleteCategory(id: string): void {
    try {
      this.db.prepare("delete from blog_categories where id=?").run(id);
    } catch (error) {
      if (error instanceof Error && error.message.includes("FOREIGN KEY constraint failed"))
        throw new BlogCategoryInUseError();
      throw error;
    }
  }

  categoryIsUsed(id: string): boolean {
    return Boolean(
      this.db.prepare("select 1 from blog_post_revisions where category_id=? limit 1").get(id),
    );
  }

  tags() {
    return this.db.prepare("select id,slug,name from blog_tags order by name").all();
  }

  private insertRevision(
    postId: string,
    input: BlogRevisionInput,
    authorAccountId: string | null,
    revisionNumber: number,
    now: number,
  ) {
    this.db
      .prepare(
        `insert into blog_post_revisions(
           id, post_id, revision_number, slug, title, excerpt, content_markdown, desired_status,
           featured_image_url, seo_title, seo_description, canonical_url, category_id,
           created_by_account_id, created_at, updated_at
         ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.id,
        postId,
        revisionNumber,
        input.slug,
        input.title,
        input.excerpt,
        input.content,
        input.desiredStatus,
        input.featuredImageUrl,
        input.seoTitle,
        input.seoDescription,
        input.canonicalUrl,
        input.categoryId,
        authorAccountId,
        now,
        now,
      );
    this.replaceRevisionTags(input.id, input.tags);
  }

  private revisionRow(where: string, ...values: string[]) {
    return this.db
      .prepare(
        `select p.id post_id, r.id revision_id, r.slug, r.title, r.excerpt, r.content_markdown,
                r.desired_status, r.featured_image_url, r.seo_title, r.seo_description,
                r.canonical_url, r.category_id, p.author_account_id, p.publication_state,
                p.working_revision_id, p.published_at, p.created_at, r.updated_at revision_updated_at,
                wr.updated_at working_updated_at, c.slug category_slug, c.name category_name
           from blog_posts p join blog_post_revisions r on r.post_id=p.id
           left join blog_post_revisions wr on wr.id=p.working_revision_id
           left join blog_categories c on c.id=r.category_id
          where ${where} limit 1`,
      )
      .get(...values) as Row | undefined;
  }

  private revisionTags(revisionId: string) {
    return this.db
      .prepare(
        "select t.slug,t.name from blog_post_revision_tags rt join blog_tags t on t.id=rt.tag_id where rt.revision_id=? order by t.name",
      )
      .all(revisionId) as Array<{ slug: string; name: string }>;
  }

  private replaceRevisionTags(revisionId: string, names: string[]) {
    for (const name of names) {
      let tag = this.db.prepare("select id from blog_tags where lower(name)=lower(?)").get(name) as
        { id: string } | undefined;
      if (!tag) {
        const id = newId();
        const base = slugify(name, { lower: true, strict: true, trim: true }) || "tag";
        let slug = base;
        let suffix = 1;
        while (this.db.prepare("select id from blog_tags where slug=?").get(slug))
          slug = `${base}-${++suffix}`;
        this.db.prepare("insert into blog_tags(id,slug,name) values(?,?,?)").run(id, slug, name);
        tag = { id };
      }
      this.db
        .prepare("insert into blog_post_revision_tags(revision_id,tag_id) values(?,?)")
        .run(revisionId, tag.id);
    }
  }

  private throwCategoryConflict(error: unknown): never {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("blog_categories.name")) throw new BlogCategoryConflictError("name");
    if (message.includes("blog_categories.slug")) throw new BlogCategoryConflictError("slug");
    throw error;
  }
}
