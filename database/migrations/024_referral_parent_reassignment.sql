-- Allow controlled parent reassignment while retaining database-level cycle safety.
drop trigger if exists account_referrals_immutable on referral_capability.account_referrals;
drop function if exists referral_capability.prevent_account_referral_mutation();

create or replace function referral_capability.enforce_account_referral_hierarchy()
returns trigger language plpgsql as $$
declare cycle_exists boolean;
begin
  perform pg_advisory_xact_lock(hashtext('cliqero:referral-graph-mutation'));
  if new.child_account_id = new.parent_account_id then
    raise exception 'Referral relationship would create a cycle' using errcode='23514';
  end if;
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

drop trigger if exists account_referrals_hierarchy_guard on referral_capability.account_referrals;
create trigger account_referrals_hierarchy_guard
before insert or update of parent_account_id on referral_capability.account_referrals
for each row execute function referral_capability.enforce_account_referral_hierarchy();

create or replace function referral_capability.prevent_account_referral_child_change()
returns trigger language plpgsql as $$
begin
  if new.child_account_id <> old.child_account_id then
    raise exception 'Referral child account identity is immutable' using errcode='55000';
  end if;
  return new;
end $$;
drop trigger if exists account_referrals_child_identity_guard on referral_capability.account_referrals;
create trigger account_referrals_child_identity_guard
before update of child_account_id on referral_capability.account_referrals
for each row execute function referral_capability.prevent_account_referral_child_change();

create or replace function referral_capability.prevent_account_referral_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Referral relationship deletion is not supported' using errcode='55000';
end $$;
drop trigger if exists account_referrals_delete_guard on referral_capability.account_referrals;
create trigger account_referrals_delete_guard
before delete on referral_capability.account_referrals
for each row execute function referral_capability.prevent_account_referral_delete();

alter table referral_capability.account_referrals
  add constraint account_referrals_child_account_fk
    foreign key (child_account_id) references identity_capability.accounts(id) on delete restrict,
  add constraint account_referrals_parent_account_fk
    foreign key (parent_account_id) references identity_capability.accounts(id) on delete restrict;

comment on table referral_capability.account_referrals is 'One-parent account referral hierarchy; parent reassignment is operator-controlled, recursive traversal is performed in PostgreSQL, and historical financial facts are not rewritten.';
