-- Temporary operator-only render snapshots. Payloads are validated by the application on read.
create table blog_previews (
  id text primary key not null,
  account_id text not null,
  payload_json text not null,
  created_at integer not null,
  updated_at integer not null,
  expires_at integer not null
);
create index blog_previews_expiry_idx on blog_previews(expires_at);
