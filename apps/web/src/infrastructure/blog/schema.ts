import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const blogPosts = sqliteTable(
  "blog_posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    contentMarkdown: text("content_markdown").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    featuredImageUrl: text("featured_image_url"),
    authorAccountId: text("author_account_id"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalUrl: text("canonical_url"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("blog_posts_status_created_idx").on(table.status, table.createdAt)],
);

export const blogPreviews = sqliteTable(
  "blog_previews",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("blog_previews_expiry_idx").on(table.expiresAt)],
);

export const blogPostCategories = sqliteTable(
  "blog_post_categories",
  {
    postId: text("post_id").notNull(),
    categoryId: text("category_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.categoryId] })],
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

export const blogMediaAssets = sqliteTable(
  "blog_media_assets",
  {
    id: text("id").primaryKey(),
    ownerAccountId: text("owner_account_id").notNull(),
    postId: text("post_id").references(() => blogPosts.id, { onDelete: "set null" }),
    storageProvider: text("storage_provider").notNull(),
    storageContainer: text("storage_container").notNull(),
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    state: text("state", { enum: ["active", "deletion_pending"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("blog_media_assets_expiry_idx").on(table.expiresAt),
    index("blog_media_assets_cleanup_idx").on(table.state, table.createdAt),
    uniqueIndex("blog_media_assets_active_post_idx")
      .on(table.postId)
      .where(sql`${table.postId} is not null and ${table.state} = 'active'`),
  ],
);
