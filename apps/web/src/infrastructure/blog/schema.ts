import { integer, primaryKey, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const blogPosts = sqliteTable(
  "blog_posts",
  {
    id: text("id").primaryKey(),
    publicationState: text("publication_state", { enum: ["draft", "published"] }).notNull(),
    authorAccountId: text("author_account_id"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    publishedRevisionId: text("published_revision_id"),
    workingRevisionId: text("working_revision_id"),
  },
  (table) => [
    index("blog_posts_publication_created_idx").on(table.publicationState, table.createdAt),
  ],
);

export const blogPostRevisions = sqliteTable(
  "blog_post_revisions",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    contentMarkdown: text("content_markdown").notNull(),
    desiredStatus: text("desired_status", { enum: ["draft", "published"] }).notNull(),
    featuredImageUrl: text("featured_image_url"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalUrl: text("canonical_url"),
    categoryId: text("category_id"),
    createdByAccountId: text("created_by_account_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("blog_post_revisions_slug_idx").on(table.slug),
    index("blog_post_revisions_post_created_idx").on(table.postId, table.createdAt),
  ],
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

export const blogPostRevisionTags = sqliteTable(
  "blog_post_revision_tags",
  { revisionId: text("revision_id").notNull(), tagId: text("tag_id").notNull() },
  (table) => [primaryKey({ columns: [table.revisionId, table.tagId] })],
);

export const blogIdempotency = sqliteTable("blog_idempotency", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  postId: text("post_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
