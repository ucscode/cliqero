create table if not exists payout_capability.paystack_recipients(
  id uuid primary key default gen_random_uuid(), account_id uuid not null references identity_capability.accounts(id),
  destination_fingerprint text not null, recipient_code text not null, bank_code text not null,
  account_last4 text not null, account_name text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(account_id,destination_fingerprint), unique(recipient_code)
);
create index if not exists paystack_recipients_account_idx on payout_capability.paystack_recipients(account_id);
create table if not exists payout_capability.paystack_events(
  id uuid primary key, event_key text not null unique, event_type text not null,
  provider_reference text not null, amount_minor text not null, currency text not null,
  payload jsonb not null, ignored_reason text, received_at timestamptz not null default now()
);
create index if not exists paystack_events_reference_idx on payout_capability.paystack_events(provider_reference);
