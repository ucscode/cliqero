-- Reapply the canonical maintenance-escape guard when provisioning an existing
-- database. Custom GUCs are caller-settable; only the table owner may use the
-- root-delete escape hatch. Ordinary runtime DML always remains trigger-checked.
CREATE OR REPLACE FUNCTION ledger_capability.prevent_entry_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if current_setting('cliqero.root_delete', true) = 'on'
     and current_user = pg_get_userbyid((select relowner from pg_class where oid = tg_relid)) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Ledger entries are append-only; use compensating entries' using errcode='55000';
end $$;

CREATE OR REPLACE FUNCTION treasury_capability.prevent_entry_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin
  if current_setting('cliqero.root_delete', true) = 'on'
     and current_user = pg_get_userbyid((select relowner from pg_class where oid = tg_relid)) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Treasury entries are append-only; use compensating entries' using errcode='55000';
end $$;

CREATE OR REPLACE FUNCTION wallet_capability.prevent_movement_mutation() RETURNS trigger
    LANGUAGE plpgsql
AS $$ begin
  if current_setting('cliqero.root_delete', true) = 'on'
     and current_user = pg_get_userbyid((select relowner from pg_class where oid = tg_relid)) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Wallet movements are append-only; use a compensating entry' using errcode='55000';
end $$;

CREATE OR REPLACE FUNCTION referral_capability.prevent_account_referral_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if current_setting('cliqero.root_delete', true) = 'on'
     and current_user = pg_get_userbyid((select relowner from pg_class where oid = tg_relid)) then
    return old;
  end if;
  if exists (
    select 1 from identity_capability.accounts
    where id in (old.child_account_id, old.parent_account_id) and deleted_at is not null
  ) then
    return old;
  end if;
  raise exception 'Referral relationship deletion is not supported' using errcode='55000';
end $$;
