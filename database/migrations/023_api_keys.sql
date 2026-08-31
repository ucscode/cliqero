create table if not exists identity_capability.api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references identity_capability.accounts(id) on delete cascade,
  name text not null,
  key_prefix text not null unique,
  secret_hash bytea not null unique,
  scopes jsonb not null default '[]'::jsonb,
  created_by uuid references identity_capability.accounts(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint api_keys_name_nonempty check (length(trim(name)) > 0),
  constraint api_keys_scopes_array check (jsonb_typeof(scopes) = 'array')
);
create index if not exists api_keys_account_idx on identity_capability.api_keys(account_id,created_at desc);
create index if not exists api_keys_active_prefix_idx on identity_capability.api_keys(key_prefix) where revoked_at is null;
comment on table identity_capability.api_keys is 'Hashed headless API credentials mapped to Cliqero accounts; raw secrets are returned only at creation.';
