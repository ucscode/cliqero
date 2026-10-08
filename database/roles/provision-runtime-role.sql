\set ON_ERROR_STOP on
\getenv runtime_role POSTGRES_APP_USER
\getenv runtime_password POSTGRES_APP_PASSWORD

BEGIN;

SELECT format(
  'DO $role_guard$ BEGIN IF current_user = %L THEN RAISE EXCEPTION ''The PostgreSQL runtime role must differ from the bootstrap role''; END IF; END $role_guard$',
  :'runtime_role'
)
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
  :'runtime_role', :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
  :'runtime_role'
)
\gexec

SELECT format('REVOKE %I FROM %I', granted.rolname, :'runtime_role')
  FROM pg_auth_members membership
  JOIN pg_roles granted ON granted.oid = membership.roleid
  JOIN pg_roles member ON member.oid = membership.member
 WHERE member.rolname = :'runtime_role'
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_role')
\gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM :"runtime_role";

SELECT format('GRANT USAGE ON SCHEMA %I TO %I', namespace.nspname, :'runtime_role')
  FROM pg_namespace namespace
 WHERE namespace.nspname = ANY (ARRAY[
   'access_capability', 'better_auth', 'checkout_capability', 'entitlement_capability',
   'funding_capability', 'identity_capability', 'kernel', 'ledger_capability',
   'listing_capability', 'money_capability', 'payment_capability', 'purchase_capability',
   'referral_capability', 'treasury_capability', 'wallet_capability', 'withdrawal_capability'
 ])
\gexec

SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
  namespace.nspname, :'runtime_role'
)
  FROM pg_namespace namespace
 WHERE namespace.nspname = ANY (ARRAY[
   'access_capability', 'better_auth', 'checkout_capability', 'entitlement_capability',
   'funding_capability', 'identity_capability', 'kernel', 'ledger_capability',
   'listing_capability', 'money_capability', 'payment_capability', 'purchase_capability',
   'referral_capability', 'treasury_capability', 'wallet_capability', 'withdrawal_capability'
 ])
\gexec

SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', namespace.nspname, :'runtime_role')
  FROM pg_namespace namespace
 WHERE namespace.nspname = ANY (ARRAY[
   'access_capability', 'better_auth', 'checkout_capability', 'entitlement_capability',
   'funding_capability', 'identity_capability', 'kernel', 'ledger_capability',
   'listing_capability', 'money_capability', 'payment_capability', 'purchase_capability',
   'referral_capability', 'treasury_capability', 'wallet_capability', 'withdrawal_capability'
 ])
\gexec

SELECT format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO %I', namespace.nspname, :'runtime_role')
  FROM pg_namespace namespace
 WHERE namespace.nspname = ANY (ARRAY[
   'access_capability', 'better_auth', 'checkout_capability', 'entitlement_capability',
   'funding_capability', 'identity_capability', 'kernel', 'ledger_capability',
   'listing_capability', 'money_capability', 'payment_capability', 'purchase_capability',
   'referral_capability', 'treasury_capability', 'wallet_capability', 'withdrawal_capability'
 ])
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  current_user, namespace.nspname, :'runtime_role'
)
  FROM pg_namespace namespace
 WHERE namespace.nspname = ANY (ARRAY[
   'access_capability', 'better_auth', 'checkout_capability', 'entitlement_capability',
   'funding_capability', 'identity_capability', 'kernel', 'ledger_capability',
   'listing_capability', 'money_capability', 'payment_capability', 'purchase_capability',
   'referral_capability', 'treasury_capability', 'wallet_capability', 'withdrawal_capability'
 ])
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I',
  current_user, namespace.nspname, :'runtime_role'
)
  FROM pg_namespace namespace
 WHERE namespace.nspname = ANY (ARRAY[
   'access_capability', 'better_auth', 'checkout_capability', 'entitlement_capability',
   'funding_capability', 'identity_capability', 'kernel', 'ledger_capability',
   'listing_capability', 'money_capability', 'payment_capability', 'purchase_capability',
   'referral_capability', 'treasury_capability', 'wallet_capability', 'withdrawal_capability'
 ])
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I',
  current_user, namespace.nspname, :'runtime_role'
)
  FROM pg_namespace namespace
 WHERE namespace.nspname = ANY (ARRAY[
   'access_capability', 'better_auth', 'checkout_capability', 'entitlement_capability',
   'funding_capability', 'identity_capability', 'kernel', 'ledger_capability',
   'listing_capability', 'money_capability', 'payment_capability', 'purchase_capability',
   'referral_capability', 'treasury_capability', 'wallet_capability', 'withdrawal_capability'
 ])
\gexec

COMMIT;
