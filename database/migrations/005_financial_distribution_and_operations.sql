create table ledger_capability.distribution_policy (
  singleton boolean primary key default true check (singleton),
  platform_account_id uuid not null,
  platform_rate_basis_points integer not null default 0,
  remainder_recipient text not null default 'seller',
  updated_at timestamptz not null default now(),
  constraint distribution_policy_rate_valid check (platform_rate_basis_points between 0 and 10000),
  constraint distribution_policy_remainder_valid check (remainder_recipient in ('seller','platform'))
);
insert into ledger_capability.distribution_policy(singleton,platform_account_id)
values(true,'00000000-0000-4000-8000-000000000001');

create table ledger_capability.purchase_distributions (
  id uuid primary key,
  purchase_id uuid not null unique,
  gross_minor bigint not null,
  currency text not null,
  policy_snapshot jsonb not null,
  correlation_id uuid not null,
  completed_at timestamptz not null default now(),
  constraint purchase_distributions_gross_nonnegative check (gross_minor >= 0),
  constraint purchase_distributions_currency_format check (currency ~ '^[A-Z]{3}$')
);

alter table ledger_capability.entries
  add column distribution_id uuid references ledger_capability.purchase_distributions(id),
  add column recipient_role text,
  add column basis text,
  add column referral_level integer,
  add column balance_state text not null default 'available';

alter table ledger_capability.entries
  add constraint ledger_entries_recipient_role_valid check (recipient_role in ('seller','referral','platform')),
  add constraint ledger_entries_referral_level_valid check (referral_level is null or referral_level > 0),
  add constraint ledger_entries_balance_state_valid check (balance_state in ('pending','available'));

create index ledger_entries_distribution_idx on ledger_capability.entries(distribution_id);
create index ledger_entries_account_summary_idx on ledger_capability.entries(account_id,currency,balance_state,direction);

create function ledger_capability.prevent_entry_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Ledger entries are append-only; use compensating entries' using errcode='55000';
end $$;
create trigger ledger_entries_append_only
before update or delete on ledger_capability.entries
for each row execute function ledger_capability.prevent_entry_mutation();

create table identity_capability.account_capabilities (
  account_id uuid not null,
  capability text not null,
  granted_at timestamptz not null default now(),
  primary key(account_id,capability),
  constraint account_capabilities_known check (capability in ('operator'))
);

alter table payment_capability.payments
  add column provider_fee_minor bigint,
  add column provider_fee_currency text,
  add constraint payments_provider_fee_nonnegative check (provider_fee_minor is null or provider_fee_minor >= 0),
  add constraint payments_provider_fee_currency_pair check ((provider_fee_minor is null) = (provider_fee_currency is null));

create table payment_capability.reconciliation_attempts (
  id uuid primary key,
  payment_id uuid not null,
  idempotency_key text not null,
  state text not null,
  result jsonb,
  last_error text,
  actor_id uuid not null,
  correlation_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint reconciliation_attempt_identity_unique unique(payment_id,idempotency_key),
  constraint reconciliation_attempt_state_valid check (state in ('started','completed','skipped','mismatch','failed'))
);
create index reconciliation_attempts_payment_idx on payment_capability.reconciliation_attempts(payment_id,started_at desc);
create index payments_pending_paystack_idx on payment_capability.payments(created_at,id) where provider_name='paystack' and state='pending';

comment on table ledger_capability.purchase_distributions is 'One immutable, atomically committed financial distribution per completed purchase.';
comment on column payment_capability.payments.provider_fee_minor is 'Provider-reported fee retained for audit; V1 distribution policy treats it as informational.';
