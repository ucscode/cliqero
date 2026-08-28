create extension if not exists pgcrypto;

create schema if not exists kernel;
create schema if not exists identity_capability;
create schema if not exists listing_capability;
create schema if not exists purchase_capability;
create schema if not exists entitlement_capability;
create schema if not exists access_capability;
create schema if not exists ledger_capability;

create table kernel.idempotency_records (
  scope text not null,
  idempotency_key text not null,
  result_reference uuid,
  created_at timestamptz not null default now(),
  primary key (scope, idempotency_key)
);

create table kernel.outbox_events (
  id uuid primary key,
  event_name text not null,
  aggregate_id uuid not null,
  correlation_id uuid not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  published_at timestamptz
);
create index outbox_events_unpublished_idx on kernel.outbox_events (occurred_at) where published_at is null;

create table kernel.audit_records (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  subject_type text not null,
  subject_id text not null,
  previous_state jsonb,
  new_state jsonb,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);
create index audit_records_subject_idx on kernel.audit_records (subject_type, subject_id, occurred_at desc);
create index audit_records_correlation_idx on kernel.audit_records (correlation_id);

create table identity_capability.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  handle text not null,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_email_unique unique (email),
  constraint accounts_handle_unique unique (handle),
  constraint accounts_handle_format check (handle ~ '^[a-z0-9][a-z0-9_-]{2,31}$')
);

create table listing_capability.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null,
  title text not null,
  description text not null default '',
  price_minor bigint not null,
  price_currency text not null,
  destination_url text not null,
  state text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_title_nonempty check (length(trim(title)) > 0),
  constraint listings_price_nonnegative check (price_minor >= 0),
  constraint listings_currency_format check (price_currency ~ '^[A-Z]{3}$'),
  constraint listings_state_valid check (state in ('draft', 'published', 'archived'))
);
create index listings_seller_idx on listing_capability.listings (seller_id, created_at desc);
create index listings_public_idx on listing_capability.listings (created_at desc) where state = 'published';

create table purchase_capability.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null,
  seller_id uuid not null,
  listing_id uuid not null,
  payment_id uuid not null,
  idempotency_key text not null,
  listing_title_snapshot text not null,
  price_minor_snapshot bigint not null,
  price_currency_snapshot text not null,
  canonical_minor_snapshot bigint not null,
  canonical_currency_snapshot text not null default 'USD',
  referral_attribution_id uuid,
  state text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_idempotency_unique unique (idempotency_key),
  constraint purchases_payment_unique unique (payment_id),
  constraint purchases_state_valid check (state in ('pending', 'paid', 'completed', 'failed', 'refunded')),
  constraint purchases_prices_nonnegative check (price_minor_snapshot >= 0 and canonical_minor_snapshot >= 0),
  constraint purchases_canonical_usd check (canonical_currency_snapshot = 'USD')
);
create index purchases_buyer_idx on purchase_capability.purchases (buyer_id, created_at desc);
create index purchases_listing_idx on purchase_capability.purchases (listing_id, created_at desc);
create index purchases_seller_idx on purchase_capability.purchases (seller_id, created_at desc);

create table entitlement_capability.entitlements (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null,
  listing_id uuid not null,
  purchase_id uuid not null,
  state text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_purchase_unique unique (purchase_id),
  constraint entitlements_state_valid check (state in ('active', 'revoked'))
);
create index entitlements_buyer_listing_idx on entitlement_capability.entitlements (buyer_id, listing_id);

create table access_capability.access_grants (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null,
  token_hash bytea not null,
  state text not null default 'active',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint access_grants_token_hash_unique unique (token_hash),
  constraint access_grants_state_valid check (state in ('active', 'revoked'))
);
create index access_grants_entitlement_idx on access_capability.access_grants (entitlement_id, created_at desc);

create table access_capability.integrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  credential_hash bytea not null,
  state text not null default 'active',
  created_at timestamptz not null default now(),
  constraint integrations_credential_hash_unique unique (credential_hash),
  constraint integrations_state_valid check (state in ('active', 'revoked'))
);

create table access_capability.integration_listings (
  integration_id uuid not null references access_capability.integrations(id) on delete cascade,
  listing_id uuid not null,
  primary key (integration_id, listing_id)
);
create index integration_listings_listing_idx on access_capability.integration_listings (listing_id);

create table ledger_capability.entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  purchase_id uuid,
  entry_type text not null,
  direction text not null,
  amount_minor bigint not null,
  currency text not null default 'USD',
  idempotency_key text not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint ledger_entries_idempotency_unique unique (idempotency_key),
  constraint ledger_entries_direction_valid check (direction in ('debit', 'credit')),
  constraint ledger_entries_amount_positive check (amount_minor > 0),
  constraint ledger_entries_currency_format check (currency ~ '^[A-Z]{3}$')
);
create index ledger_entries_account_idx on ledger_capability.entries (account_id, created_at desc);
create index ledger_entries_purchase_idx on ledger_capability.entries (purchase_id) where purchase_id is not null;

comment on table access_capability.access_grants is 'Stores SHA-256 hashes of opaque source credentials; plaintext source values are never persisted.';
comment on table purchase_capability.purchases is 'Immutable commercial snapshots remain authoritative after listing edits.';
comment on table ledger_capability.entries is 'Append-only financial history; corrections require compensating entries.';

