create schema if not exists payout_capability;

create table payout_capability.executions (
  id uuid primary key,
  withdrawal_id uuid not null unique references withdrawal_capability.withdrawals(id),
  provider_name text not null,
  idempotency_key text not null unique,
  state text not null default 'ready',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_executions_state_valid check (state in ('ready','submitted','succeeded','failed','unknown')),
  constraint payout_executions_attempt_nonnegative check (attempt_count >= 0)
);
create index payout_executions_retry_idx on payout_capability.executions(state,next_attempt_at)
  where state in ('failed','unknown');

create table payout_capability.attempts (
  id uuid primary key,
  execution_id uuid not null references payout_capability.executions(id),
  withdrawal_id uuid not null references withdrawal_capability.withdrawals(id),
  provider_name text not null,
  provider_request_key text not null,
  provider_reference text,
  amount_minor bigint not null,
  currency text not null,
  state text not null,
  failure_category text,
  failure_reason text,
  provider_metadata jsonb,
  correlation_id uuid not null,
  attempt_number integer not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  constraint payout_attempts_state_valid check (state in ('created','submitted','succeeded','failed','unknown','pending')),
  constraint payout_attempts_failure_category_valid check (failure_category is null or failure_category in ('retryable_technical','permanent_validation','provider_rejection','unknown','authenticated_provider_failure')),
  constraint payout_attempts_amount_positive check (amount_minor > 0),
  constraint payout_attempts_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payout_attempts_number_positive check (attempt_number > 0),
  constraint payout_attempts_request_unique unique(execution_id,attempt_number)
);
create index payout_attempts_withdrawal_idx on payout_capability.attempts(withdrawal_id,created_at desc);
create index payout_attempts_reference_idx on payout_capability.attempts(provider_name,provider_reference) where provider_reference is not null;
