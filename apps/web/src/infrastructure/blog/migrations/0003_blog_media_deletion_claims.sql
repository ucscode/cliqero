-- Lease pending storage deletions so the web process and outbox worker cannot
-- concurrently process the same object, and crashed workers can be recovered.
alter table blog_media_assets add column deletion_claim_token text;
alter table blog_media_assets add column deletion_claimed_at integer;
alter table blog_media_assets add column deletion_attempts integer not null default 0;
alter table blog_media_assets add column deletion_retry_at integer;

create index blog_media_assets_deletion_claim_idx
  on blog_media_assets(state, deletion_claimed_at, created_at);
