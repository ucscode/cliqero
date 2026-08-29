alter table ledger_capability.distribution_policy
  add column initial_balance_state text not null default 'pending',
  add column settlement_delay_seconds integer not null default 0,
  add constraint distribution_policy_initial_state_valid check (initial_balance_state in ('pending','available')),
  add constraint distribution_policy_delay_valid check (settlement_delay_seconds >= 0);

alter table ledger_capability.entries add column maturity_at timestamptz;
create index ledger_entries_settlement_idx on ledger_capability.entries(maturity_at,id)
  where balance_state='pending' and maturity_at is not null;

create table ledger_capability.entry_settlements (
  id uuid primary key,
  original_entry_id uuid not null unique references ledger_capability.entries(id),
  from_state text not null,
  to_state text not null,
  idempotency_key text not null unique,
  settled_at timestamptz not null default now(),
  constraint entry_settlements_states check (from_state='pending' and to_state='available')
);
create index entry_settlements_entry_idx on ledger_capability.entry_settlements(original_entry_id);

create table ledger_capability.reversals (
  id uuid primary key,
  purchase_id uuid not null unique references purchase_capability.purchases(id),
  distribution_id uuid not null references ledger_capability.purchase_distributions(id),
  state text not null default 'processed',
  reason text not null,
  source text not null,
  idempotency_key text not null unique,
  correlation_id uuid not null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint reversals_state_valid check (state in ('requested','verified','processed','failed'))
);
create index reversals_distribution_idx on ledger_capability.reversals(distribution_id);

alter table ledger_capability.entries
  add column original_entry_id uuid references ledger_capability.entries(id),
  add column reversal_id uuid references ledger_capability.reversals(id),
  add constraint ledger_entries_reversal_pair check ((reversal_id is null and original_entry_id is null) or (reversal_id is not null and original_entry_id is not null));
create index ledger_entries_reversal_idx on ledger_capability.entries(reversal_id) where reversal_id is not null;
