alter table identity_capability.accounts
  add column password_salt bytea,
  add column password_hash bytea;

create table identity_capability.sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  token_hash bytea not null,
  state text not null default 'active',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint sessions_token_hash_unique unique (token_hash),
  constraint sessions_state_valid check (state in ('active', 'revoked'))
);
create index sessions_account_idx on identity_capability.sessions (account_id, created_at desc);

create schema if not exists payment_capability;
create table payment_capability.payments (
  id uuid primary key,
  provider_name text not null,
  provider_reference text not null,
  buyer_id uuid not null,
  listing_id uuid not null,
  provider_amount_minor bigint not null,
  provider_currency text not null,
  canonical_amount_minor bigint not null,
  canonical_currency text not null default 'USD',
  state text not null default 'pending',
  idempotency_key text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_reference_unique unique (provider_name, provider_reference),
  constraint payments_idempotency_unique unique (idempotency_key),
  constraint payments_state_valid check (state in ('pending', 'verified', 'failed')),
  constraint payments_amounts_nonnegative check (provider_amount_minor >= 0 and canonical_amount_minor >= 0),
  constraint payments_canonical_usd check (canonical_currency = 'USD')
);
create index payments_buyer_idx on payment_capability.payments (buyer_id, created_at desc);
create index payments_listing_idx on payment_capability.payments (listing_id, created_at desc);

alter table kernel.idempotency_records
  add column state text not null default 'completed',
  add column response jsonb,
  add column updated_at timestamptz not null default now(),
  add constraint idempotency_records_state_valid check (state in ('processing', 'completed', 'failed'));

alter table kernel.outbox_events
  add column state text not null default 'pending',
  add column attempt_count integer not null default 0,
  add column available_at timestamptz not null default now(),
  add column claimed_at timestamptz,
  add column claimed_by text,
  add column last_error text,
  add constraint outbox_events_state_valid check (state in ('pending', 'processing', 'published', 'failed')),
  add constraint outbox_events_attempt_count_nonnegative check (attempt_count >= 0);

drop index kernel.outbox_events_unpublished_idx;
create index outbox_events_claimable_idx
  on kernel.outbox_events (available_at, occurred_at)
  where state in ('pending', 'failed');

alter table access_capability.access_grants add column idempotency_key text;
alter table access_capability.access_grants
  add constraint access_grants_idempotency_unique unique (idempotency_key);

alter table access_capability.integrations add column credential_salt bytea;
update access_capability.integrations set credential_salt = gen_random_bytes(16) where credential_salt is null;
alter table access_capability.integrations alter column credential_salt set not null;

