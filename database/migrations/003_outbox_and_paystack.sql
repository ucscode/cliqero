alter table payment_capability.payments
  add column provider_transaction_id text,
  add column provider_verified_payload jsonb,
  add column provider_initialization jsonb;

create table payment_capability.provider_events (
  id uuid primary key,
  provider_name text not null,
  event_key text not null,
  event_type text not null,
  provider_reference text,
  amount_minor bigint,
  currency text,
  payload jsonb not null,
  state text not null default 'received',
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint provider_events_identity_unique unique (provider_name,event_key),
  constraint provider_events_state_valid check (state in ('received','processed','rejected','ignored')),
  constraint provider_events_amount_nonnegative check (amount_minor is null or amount_minor >= 0)
);
create index provider_events_reference_idx
  on payment_capability.provider_events (provider_name,provider_reference)
  where provider_reference is not null;
create index provider_events_state_idx
  on payment_capability.provider_events (state,received_at)
  where state in ('received','rejected');
