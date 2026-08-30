alter table listing_capability.listings
  add column external_key text;

alter table listing_capability.listings
  add constraint listings_external_key_format
    check (external_key is null or external_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  add constraint listings_seller_external_key_unique unique (seller_id, external_key);

create index listings_public_query_idx
  on listing_capability.listings (state, created_at desc, id desc);
create index listings_owner_query_idx
  on listing_capability.listings (seller_id, state, created_at desc, id desc);
create index listings_search_idx
  on listing_capability.listings using gin (to_tsvector('simple', title || ' ' || description));

create table listing_capability.media (
  id uuid primary key,
  listing_id uuid not null references listing_capability.listings(id),
  storage_provider text not null,
  storage_container text not null,
  object_key text not null,
  mime_type text not null,
  original_filename text,
  byte_size bigint not null check (byte_size > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  position integer not null check (position >= 0),
  alt_text text not null default '',
  state text not null default 'active' check (state in ('active','deletion_pending','deleted')),
  deletion_requested_at timestamptz,
  deletion_attempted_at timestamptz,
  last_deletion_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_media_storage_identity_unique unique (storage_provider, storage_container, object_key)
);

create index listing_media_order_idx
  on listing_capability.media (listing_id, state, position, created_at, id);
create index listing_media_deletion_work_idx
  on listing_capability.media (state, deletion_attempted_at, id)
  where state='deletion_pending';

alter table access_capability.integrations
  add column updated_at timestamptz not null default now();

comment on table listing_capability.media is
  'Provider-neutral listing image identity and durable deletion workflow. Public URLs are resolved through storage_provider plus container and object_key.';
