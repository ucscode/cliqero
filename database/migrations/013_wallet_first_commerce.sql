create schema if not exists funding_capability;
create schema if not exists wallet_capability;
create schema if not exists checkout_capability;

create table funding_capability.funding_transactions (
  id uuid primary key,
  account_id uuid not null,
  provider_name text not null,
  provider_reference text not null,
  canonical_amount_minor bigint not null,
  canonical_currency text not null default 'USD',
  collection_amount_minor bigint not null,
  collection_currency text not null,
  conversion_snapshot jsonb,
  state text not null default 'initialization_pending',
  idempotency_key text not null,
  provider_initialization jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funding_reference_unique unique(provider_name,provider_reference),
  constraint funding_idempotency_unique unique(account_id,idempotency_key),
  constraint funding_amount_positive check(canonical_amount_minor > 0 and collection_amount_minor > 0),
  constraint funding_canonical_usd check(canonical_currency='USD'),
  constraint funding_currency_format check(collection_currency ~ '^[A-Z]{3}$'),
  constraint funding_state_valid check(state in ('initialization_pending','initializing','awaiting_payment','verification_pending','confirmed','failed','blocked','reconciliation_pending'))
);
create index funding_work_idx on funding_capability.funding_transactions(state,updated_at,id);
create index funding_account_idx on funding_capability.funding_transactions(account_id,created_at desc);

create table wallet_capability.credits (
  id uuid primary key,
  account_id uuid not null,
  funding_id uuid not null references funding_capability.funding_transactions(id),
  amount_minor bigint not null,
  currency text not null default 'USD',
  state text not null default 'pending',
  created_at timestamptz not null default now(),
  available_at timestamptz,
  constraint wallet_credit_funding_unique unique(funding_id),
  constraint wallet_credit_positive check(amount_minor > 0),
  constraint wallet_credit_usd check(currency='USD'),
  constraint wallet_credit_state_valid check(state in ('pending','available'))
);
create index wallet_credit_work_idx on wallet_capability.credits(state,created_at,id);
create index wallet_credit_account_idx on wallet_capability.credits(account_id,created_at desc);

create table checkout_capability.checkouts (
  id uuid primary key,
  buyer_id uuid not null,
  listing_id uuid not null,
  purchase_id uuid not null unique,
  amount_minor bigint not null,
  currency text not null default 'USD',
  state text not null default 'awaiting_funds',
  idempotency_key text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkout_idempotency_unique unique(buyer_id,idempotency_key),
  constraint checkout_amount_positive check(amount_minor > 0),
  constraint checkout_usd check(currency='USD'),
  constraint checkout_state_valid check(state in ('awaiting_funds','paid','failed'))
);
create index checkout_work_idx on checkout_capability.checkouts(state,created_at,id);
create index checkout_buyer_idx on checkout_capability.checkouts(buyer_id,created_at desc);

create table wallet_capability.debits (
  id uuid primary key,
  account_id uuid not null,
  checkout_id uuid not null references checkout_capability.checkouts(id),
  amount_minor bigint not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  constraint wallet_debit_checkout_unique unique(checkout_id),
  constraint wallet_debit_positive check(amount_minor > 0),
  constraint wallet_debit_usd check(currency='USD')
);
create index wallet_debit_account_idx on wallet_capability.debits(account_id,created_at desc);

alter table purchase_capability.purchases alter column payment_id drop not null;
alter table purchase_capability.purchases add column checkout_id uuid;
alter table purchase_capability.purchases add constraint purchases_checkout_unique unique(checkout_id);

alter table entitlement_capability.entitlements add column expires_at timestamptz;
alter table entitlement_capability.entitlements drop constraint entitlements_state_valid;
alter table entitlement_capability.entitlements add constraint entitlements_state_valid check(state in ('active','revoked','expired'));

create function wallet_capability.prevent_movement_mutation()
returns trigger language plpgsql as $$ begin
  raise exception 'Wallet movements are append-only; use a compensating entry' using errcode='55000';
end $$;
create trigger wallet_credits_append_only before update or delete on wallet_capability.credits
for each row when (old.state='available') execute function wallet_capability.prevent_movement_mutation();
create trigger wallet_debits_append_only before update or delete on wallet_capability.debits
for each row execute function wallet_capability.prevent_movement_mutation();

comment on schema wallet_capability is 'Buyer spendable wallet accounting; distinct from seller/referral/platform earnings and withdrawals.';
comment on table funding_capability.funding_transactions is 'Provider-neutral incoming money facts; never directly purchase a listing.';
