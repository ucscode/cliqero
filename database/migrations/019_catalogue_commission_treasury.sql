alter table identity_capability.account_capabilities drop constraint account_capabilities_known;
alter table identity_capability.account_capabilities add constraint account_capabilities_known check (capability in ('operator','catalogue_manager'));

alter table ledger_capability.purchase_distributions
  add column platform_amount_minor bigint not null default 0 check (platform_amount_minor >= 0);

comment on column listing_capability.listings.seller_id is 'Legacy owner/audit identity retained for historical compatibility; new catalogue listings do not imply a seller payee.';
comment on table ledger_capability.distribution_policy is 'Legacy provider-backed distribution policy; new wallet purchases use validated distribution YAML.';

create schema if not exists treasury_capability;
create table treasury_capability.entries (
  id uuid primary key,
  direction text not null check (direction in ('credit','debit')),
  amount_minor bigint not null check (amount_minor > 0),
  title text not null,
  note text,
  source_kind text,
  source_id uuid,
  idempotency_key text not null unique,
  actor_id uuid,
  created_at timestamptz not null default now(),
  constraint treasury_source_pair check ((source_kind is null) = (source_id is null))
);
create index treasury_entries_created_idx on treasury_capability.entries(created_at desc,id desc);
create index treasury_entries_source_idx on treasury_capability.entries(source_kind,source_id);
create function treasury_capability.prevent_entry_mutation() returns trigger language plpgsql as $$ begin raise exception 'Treasury entries are append-only; use compensating entries' using errcode='55000'; end $$;
create trigger treasury_entries_append_only before update or delete on treasury_capability.entries for each row execute function treasury_capability.prevent_entry_mutation();
comment on table treasury_capability.entries is 'Append-only canonical USD company treasury facts; balance is a projection over entries.';
