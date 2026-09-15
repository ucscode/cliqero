-- This migration is intentionally SQLite-only. It is applied by the blog
-- database bootstrap and never by the PostgreSQL migration runner.
create table if not exists blog_posts (id text primary key not null, slug text not null unique, title text not null, excerpt text not null, content_markdown text not null, status text not null default 'draft', featured_image_url text, author_account_id text, seo_title text, seo_description text, canonical_url text, published_at integer, created_at integer not null, updated_at integer not null, category_id text);
create index if not exists blog_posts_status_created_idx on blog_posts(status, created_at desc, id desc);
create table if not exists blog_categories (id text primary key not null, slug text not null unique, name text not null unique);
create table if not exists blog_tags (id text primary key not null, slug text not null unique, name text not null unique);
create table if not exists blog_post_tags (post_id text not null, tag_id text not null, primary key(post_id, tag_id), foreign key(post_id) references blog_posts(id) on delete cascade, foreign key(tag_id) references blog_tags(id) on delete cascade);
create table if not exists blog_idempotency (key text primary key not null, request_hash text not null, post_id text not null, created_at integer not null);
