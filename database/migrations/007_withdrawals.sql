create schema if not exists withdrawal_capability;

create table withdrawal_capability.withdrawals (
  id uuid primary key,
  account_id uuid not null,
  amount_minor bigint not null,
  currency text not null,
  destination_type text not null,
  destination_reference text not null,
  state text not null default 'requested',
  idempotency_key text not null unique,
  correlation_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  constraint withdrawals_amount_positive check (amount_minor > 0),
  constraint withdrawals_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint withdrawals_destination_type_valid check (destination_type in ('bank','manual')),
  constraint withdrawals_state_valid check (state in ('requested','approved','rejected','cancelled','completed','failed'))
);
create index withdrawals_account_idx on withdrawal_capability.withdrawals(account_id,created_at desc);
create index withdrawals_state_idx on withdrawal_capability.withdrawals(state,created_at);

create table ledger_capability.withdrawal_reservations (
  id uuid primary key,
  withdrawal_id uuid not null unique,
  account_id uuid not null,
  amount_minor bigint not null,
  currency text not null,
  created_at timestamptz not null default now(),
  constraint withdrawal_reservations_amount_positive check (amount_minor > 0),
  constraint withdrawal_reservations_currency_format check (currency ~ '^[A-Z]{3}$')
);
create index withdrawal_reservations_account_idx on ledger_capability.withdrawal_reservations(account_id,currency);

create table ledger_capability.withdrawal_reservation_events (
  id uuid primary key,
  reservation_id uuid not null references ledger_capability.withdrawal_reservations(id),
  withdrawal_id uuid not null,
  account_id uuid not null,
  kind text not null,
  amount_minor bigint not null,
  currency text not null,
  idempotency_key text not null unique,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint withdrawal_reservation_events_kind_valid check (kind in ('reserved','released','completed')),
  constraint withdrawal_reservation_events_amount_positive check (amount_minor > 0)
);
create index withdrawal_reservation_events_latest_idx on ledger_capability.withdrawal_reservation_events(reservation_id,created_at desc,id desc);

create table withdrawal_capability.policy (
  singleton boolean primary key default true check (singleton),
  minimum_amount_minor bigint not null default 100,
  maximum_amount_minor bigint,
  currency text not null default 'USD',
  enabled boolean not null default true,
  constraint withdrawal_policy_min_positive check (minimum_amount_minor > 0),
  constraint withdrawal_policy_max_valid check (maximum_amount_minor is null or maximum_amount_minor >= minimum_amount_minor),
  constraint withdrawal_policy_currency_format check (currency ~ '^[A-Z]{3}$')
);
insert into withdrawal_capability.policy(singleton) values(true);
