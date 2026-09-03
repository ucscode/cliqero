import { integer, primaryKey, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const blogPosts = sqliteTable(
  "blog_posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    contentMarkdown: text("content_markdown").notNull(),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    featuredImageUrl: text("featured_image_url"),
    authorAccountId: text("author_account_id"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalUrl: text("canonical_url"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    categoryId: text("category_id"),
  },
  (table) => [index("blog_posts_status_created_idx").on(table.status, table.createdAt)],
);

export const blogCategories = sqliteTable("blog_categories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().unique(),
});

export const blogTags = sqliteTable("blog_tags", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().unique(),
});

export const blogPostTags = sqliteTable(
  "blog_post_tags",
  {
    postId: text("post_id").notNull(),
    tagId: text("tag_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
);

export const blogIdempotency = sqliteTable("blog_idempotency", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  postId: text("post_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
