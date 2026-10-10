create table blog_media_assets (
  id text primary key not null,
  owner_account_id text not null,
  post_id text references blog_posts(id) on delete set null,
  storage_provider text not null,
  storage_container text not null,
  object_key text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  state text not null check (state in ('active', 'deletion_pending')),
  created_at integer not null,
  expires_at integer
);

create unique index blog_media_assets_active_post_idx
  on blog_media_assets(post_id) where post_id is not null and state='active';
create index blog_media_assets_expiry_idx
  on blog_media_assets(expires_at) where post_id is null and state='active';
create index blog_media_assets_cleanup_idx
  on blog_media_assets(state, created_at);
