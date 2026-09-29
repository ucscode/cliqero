-- Authoritative pre-production schema for the isolated Blog SQLite database.
-- Development databases may be recreated; this file describes the current model directly.
create table blog_posts (
  id text primary key not null,
  slug text not null unique,
  title text not null,
  excerpt text not null,
  content_markdown text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  featured_image_url text,
  author_account_id text,
  seo_title text,
  seo_description text,
  canonical_url text,
  published_at integer,
  created_at integer not null,
  updated_at integer not null
);

create index blog_posts_status_created_idx
  on blog_posts(status, created_at desc, id desc);

create table blog_categories (
  id text primary key not null,
  slug text not null unique,
  name text not null
);

create unique index blog_categories_name_ci_unique
  on blog_categories(name collate nocase);

create table blog_post_categories (
  post_id text not null references blog_posts(id) on delete cascade,
  category_id text not null references blog_categories(id) on delete restrict,
  primary key (post_id, category_id)
);

create table blog_tags (
  id text primary key not null,
  slug text not null unique,
  name text not null unique
);

create table blog_post_tags (
  post_id text not null references blog_posts(id) on delete cascade,
  tag_id text not null references blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table blog_previews (
  id text primary key not null,
  account_id text not null,
  payload_json text not null,
  created_at integer not null,
  updated_at integer not null,
  expires_at integer not null
);

create index blog_previews_expiry_idx on blog_previews(expires_at);

create table blog_idempotency (
  key text primary key not null,
  request_hash text not null,
  post_id text not null references blog_posts(id) on delete cascade,
  created_at integer not null
);
