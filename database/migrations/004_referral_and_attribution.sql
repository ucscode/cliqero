create schema if not exists referral_capability;

create table referral_capability.account_referrals (
  child_account_id uuid primary key,
  parent_account_id uuid not null,
  created_at timestamptz not null default now(),
  constraint account_referrals_not_self check (child_account_id <> parent_account_id)
);
create index account_referrals_parent_child_idx
  on referral_capability.account_referrals (parent_account_id,child_account_id);

create or replace function referral_capability.enforce_account_referral_hierarchy()
returns trigger language plpgsql as $$
declare cycle_exists boolean;
begin
  perform pg_advisory_xact_lock(hashtext('cliqero:referral-graph-mutation'));
  with recursive ancestors(account_id,path) as (
    select new.parent_account_id,array[new.parent_account_id]
    union all
    select relationship.parent_account_id,ancestors.path||relationship.parent_account_id
    from ancestors
    join referral_capability.account_referrals relationship on relationship.child_account_id=ancestors.account_id
    where not relationship.parent_account_id=any(ancestors.path)
  )
  select exists(select 1 from ancestors where account_id=new.child_account_id) into cycle_exists;
  if cycle_exists then raise exception 'Referral relationship would create a cycle' using errcode='23514'; end if;
  return new;
end $$;

create trigger account_referrals_hierarchy_guard
before insert on referral_capability.account_referrals
for each row execute function referral_capability.enforce_account_referral_hierarchy();

create or replace function referral_capability.prevent_account_referral_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Referral parent assignment is immutable' using errcode='55000';
end $$;
create trigger account_referrals_immutable
before update or delete on referral_capability.account_referrals
for each row execute function referral_capability.prevent_account_referral_mutation();

create table referral_capability.listing_referral_links (
  id uuid primary key,
  code text not null unique,
  listing_id uuid not null,
  referrer_account_id uuid not null,
  state text not null default 'active',
  created_at timestamptz not null default now(),
  constraint listing_referral_links_state_valid check (state in ('active','revoked')),
  constraint listing_referral_links_identity_unique unique (listing_id,referrer_account_id)
);
create index listing_referral_links_referrer_idx on referral_capability.listing_referral_links (referrer_account_id,created_at desc);

create table referral_capability.listing_attributions (
  id uuid primary key,
  referral_link_id uuid not null,
  listing_id uuid not null,
  referrer_account_id uuid not null,
  token_hash bytea not null unique,
  state text not null default 'active',
  first_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint listing_attributions_state_valid check (state in ('active','revoked','expired'))
);
create index listing_attributions_link_idx on referral_capability.listing_attributions (referral_link_id,first_seen_at desc);
create index listing_attributions_active_expiry_idx on referral_capability.listing_attributions (expires_at) where state='active';

create function referral_capability.valid_commission_rates(rates integer[])
returns boolean language sql immutable as $$
  select cardinality(rates)<=32 and coalesce((select bool_and(rate between 0 and 10000) from unnest(rates) rate),true)
$$;

create table referral_capability.commission_policy (
  singleton boolean primary key default true check (singleton),
  rates_basis_points integer[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint commission_policy_rates_valid check (referral_capability.valid_commission_rates(rates_basis_points))
);
insert into referral_capability.commission_policy(singleton,rates_basis_points) values(true,'{}');

alter table purchase_capability.purchases
  add column referral_link_id uuid,
  add column referral_referrer_account_id uuid;

comment on table referral_capability.account_referrals is 'Immutable one-parent account referral hierarchy; recursive traversal is performed in PostgreSQL.';
comment on table referral_capability.listing_attributions is 'Trusted server-resolved listing visit attribution; opaque browser tokens are stored only as hashes.';
