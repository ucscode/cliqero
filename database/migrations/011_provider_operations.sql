create table payment_capability.provider_operations (
  id uuid primary key,
  payment_id uuid not null references payment_capability.payments(id),
  provider text not null,
  operation text not null,
  outcome text not null check (outcome in ('failed')),
  http_status integer,
  provider_status boolean,
  provider_message text not null,
  provider_code text,
  failure_kind text not null check (failure_kind in ('rejection','ambiguous')),
  occurred_at timestamptz not null default now()
);
create index provider_operations_payment_idx on payment_capability.provider_operations(payment_id,occurred_at desc);
