-- Canonical PostgreSQL baseline for Cliqero's current relational schema.
-- Generated from the audited final development schema; it intentionally
-- creates the current form directly rather than replaying historical changes.

-- Dumped from database version 17.10 (Debian 17.10-1.pgdg13+1)
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: access_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA access_capability;


--
-- Name: better_auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA better_auth;


--
-- Name: checkout_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA checkout_capability;


--
-- Name: entitlement_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA entitlement_capability;


--
-- Name: funding_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA funding_capability;


--
-- Name: identity_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA identity_capability;


--
-- Name: kernel; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA kernel;


--
-- Name: ledger_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ledger_capability;


--
-- Name: listing_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA listing_capability;


--
-- Name: money_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA money_capability;


--
-- Name: payment_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA payment_capability;


--
-- Name: payout_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA payout_capability;


--
-- Name: purchase_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA purchase_capability;


--
-- Name: referral_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA referral_capability;


--
-- Name: treasury_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA treasury_capability;


--
-- Name: wallet_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA wallet_capability;


--
-- Name: SCHEMA wallet_capability; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA wallet_capability IS 'Buyer spendable wallet accounting; distinct from seller/referral/platform earnings and withdrawals.';


--
-- Name: withdrawal_capability; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA withdrawal_capability;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: prevent_entry_mutation(); Type: FUNCTION; Schema: ledger_capability; Owner: -
--

CREATE FUNCTION ledger_capability.prevent_entry_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'Ledger entries are append-only; use compensating entries' using errcode='55000';
end $$;


--
-- Name: enforce_account_referral_hierarchy(); Type: FUNCTION; Schema: referral_capability; Owner: -
--

CREATE FUNCTION referral_capability.enforce_account_referral_hierarchy() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: prevent_account_referral_child_change(); Type: FUNCTION; Schema: referral_capability; Owner: -
--

CREATE FUNCTION referral_capability.prevent_account_referral_child_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.child_account_id <> old.child_account_id then
    raise exception 'Referral child account identity is immutable' using errcode='55000';
  end if;
  return new;
end $$;


--
-- Name: prevent_account_referral_delete(); Type: FUNCTION; Schema: referral_capability; Owner: -
--

CREATE FUNCTION referral_capability.prevent_account_referral_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'Referral relationship deletion is not supported' using errcode='55000';
end $$;


--
-- Name: valid_commission_rates(integer[]); Type: FUNCTION; Schema: referral_capability; Owner: -
--

CREATE FUNCTION referral_capability.valid_commission_rates(rates integer[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select cardinality(rates)<=32 and coalesce((select bool_and(rate between 0 and 10000) from unnest(rates) rate),true)
$$;


--
-- Name: prevent_entry_mutation(); Type: FUNCTION; Schema: treasury_capability; Owner: -
--

CREATE FUNCTION treasury_capability.prevent_entry_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin raise exception 'Treasury entries are append-only; use compensating entries' using errcode='55000'; end $$;


--
-- Name: prevent_movement_mutation(); Type: FUNCTION; Schema: wallet_capability; Owner: -
--

CREATE FUNCTION wallet_capability.prevent_movement_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin
  raise exception 'Wallet movements are append-only; use a compensating entry' using errcode='55000';
end $$;


SET default_table_access_method = heap;

--
-- Name: access_grants; Type: TABLE; Schema: access_capability; Owner: -
--

CREATE TABLE access_capability.access_grants (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash bytea NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    idempotency_key text,
    id bigint NOT NULL,
    entitlement_id bigint NOT NULL,
    CONSTRAINT access_grants_state_valid CHECK ((state = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: TABLE access_grants; Type: COMMENT; Schema: access_capability; Owner: -
--

COMMENT ON TABLE access_capability.access_grants IS 'Stores SHA-256 hashes of opaque source credentials; plaintext source values are never persisted.';


--
-- Name: access_grants_id_seq; Type: SEQUENCE; Schema: access_capability; Owner: -
--

ALTER TABLE access_capability.access_grants ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME access_capability.access_grants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: integration_listings; Type: TABLE; Schema: access_capability; Owner: -
--

CREATE TABLE access_capability.integration_listings (
    integration_id bigint NOT NULL,
    listing_id bigint NOT NULL
);


--
-- Name: integrations; Type: TABLE; Schema: access_capability; Owner: -
--

CREATE TABLE access_capability.integrations (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    credential_hash bytea NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    credential_salt bytea NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    owner_id bigint NOT NULL,
    CONSTRAINT integrations_state_valid CHECK ((state = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: integrations_id_seq; Type: SEQUENCE; Schema: access_capability; Owner: -
--

ALTER TABLE access_capability.integrations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME access_capability.integrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: account; Type: TABLE; Schema: better_auth; Owner: -
--

CREATE TABLE better_auth.account (
    id text NOT NULL,
    "userId" text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    issuer text NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: better_auth; Owner: -
--

CREATE TABLE better_auth.session (
    id text NOT NULL,
    "userId" text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user; Type: TABLE; Schema: better_auth; Owner: -
--

CREATE TABLE better_auth."user" (
    id text NOT NULL,
    display_name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean DEFAULT false NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verification; Type: TABLE; Schema: better_auth; Owner: -
--

CREATE TABLE better_auth.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: checkouts; Type: TABLE; Schema: checkout_capability; Owner: -
--

CREATE TABLE checkout_capability.checkouts (
    uuid uuid NOT NULL,
    amount_minor bigint NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    state text DEFAULT 'awaiting_funds'::text NOT NULL,
    idempotency_key text NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    buyer_id bigint NOT NULL,
    listing_id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    CONSTRAINT checkout_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT checkout_state_valid CHECK ((state = ANY (ARRAY['awaiting_funds'::text, 'paid'::text, 'failed'::text]))),
    CONSTRAINT checkout_usd CHECK ((currency = 'USD'::text))
);


--
-- Name: checkouts_id_seq; Type: SEQUENCE; Schema: checkout_capability; Owner: -
--

ALTER TABLE checkout_capability.checkouts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME checkout_capability.checkouts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: entitlements; Type: TABLE; Schema: entitlement_capability; Owner: -
--

CREATE TABLE entitlement_capability.entitlements (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    id bigint NOT NULL,
    buyer_id bigint NOT NULL,
    listing_id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    CONSTRAINT entitlements_state_valid CHECK ((state = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: entitlements_id_seq; Type: SEQUENCE; Schema: entitlement_capability; Owner: -
--

ALTER TABLE entitlement_capability.entitlements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME entitlement_capability.entitlements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: funding_transactions; Type: TABLE; Schema: funding_capability; Owner: -
--

CREATE TABLE funding_capability.funding_transactions (
    uuid uuid NOT NULL,
    provider_name text NOT NULL,
    provider_reference text NOT NULL,
    canonical_amount_minor bigint NOT NULL,
    canonical_currency text DEFAULT 'USD'::text NOT NULL,
    collection_amount_minor bigint NOT NULL,
    collection_currency text NOT NULL,
    conversion_snapshot jsonb,
    state text DEFAULT 'initialization_pending'::text NOT NULL,
    idempotency_key text NOT NULL,
    provider_initialization jsonb,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    initialization_claimed_at timestamp with time zone,
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    CONSTRAINT funding_amount_positive CHECK (((canonical_amount_minor > 0) AND (collection_amount_minor > 0))),
    CONSTRAINT funding_canonical_usd CHECK ((canonical_currency = 'USD'::text)),
    CONSTRAINT funding_currency_format CHECK ((collection_currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT funding_state_valid CHECK ((state = ANY (ARRAY['initialization_pending'::text, 'initializing'::text, 'awaiting_payment'::text, 'verification_pending'::text, 'confirmed'::text, 'failed'::text, 'blocked'::text, 'reconciliation_pending'::text])))
);


--
-- Name: TABLE funding_transactions; Type: COMMENT; Schema: funding_capability; Owner: -
--

COMMENT ON TABLE funding_capability.funding_transactions IS 'Provider-neutral incoming money facts; never directly purchase a listing.';


--
-- Name: COLUMN funding_transactions.initialization_claimed_at; Type: COMMENT; Schema: funding_capability; Owner: -
--

COMMENT ON COLUMN funding_capability.funding_transactions.initialization_claimed_at IS 'Lease timestamp for provider initialization. An initializing row is reclaimable only after this timestamp becomes stale.';


--
-- Name: funding_transactions_id_seq; Type: SEQUENCE; Schema: funding_capability; Owner: -
--

ALTER TABLE funding_capability.funding_transactions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME funding_capability.funding_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: account_capabilities; Type: TABLE; Schema: identity_capability; Owner: -
--

CREATE TABLE identity_capability.account_capabilities (
    capability text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id bigint NOT NULL,
    CONSTRAINT account_capabilities_known CHECK ((capability = ANY (ARRAY['system.root'::text, 'catalogue.manage'::text, 'content.manage'::text, 'accounts.read'::text, 'hierarchy.manage'::text, 'finance.read'::text, 'finance.manage'::text, 'withdrawals.manage'::text, 'treasury.manage'::text, 'reviews.moderate'::text, 'api_keys.manage'::text, 'capabilities.manage'::text])))
);


--
-- Name: accounts; Type: TABLE; Schema: identity_capability; Owner: -
--

CREATE TABLE identity_capability.accounts (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    CONSTRAINT accounts_username_format CHECK ((username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'::text))
);


--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: identity_capability; Owner: -
--

ALTER TABLE identity_capability.accounts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME identity_capability.accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: api_keys; Type: TABLE; Schema: identity_capability; Owner: -
--

CREATE TABLE identity_capability.api_keys (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    secret_hash bytea NOT NULL,
    scopes jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    created_by bigint,
    CONSTRAINT api_keys_name_nonempty CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT api_keys_scopes_array CHECK ((jsonb_typeof(scopes) = 'array'::text))
);


--
-- Name: TABLE api_keys; Type: COMMENT; Schema: identity_capability; Owner: -
--

COMMENT ON TABLE identity_capability.api_keys IS 'Hashed headless API credentials mapped to Cliqero accounts; raw secrets are returned only at creation.';


--
-- Name: api_keys_id_seq; Type: SEQUENCE; Schema: identity_capability; Owner: -
--

ALTER TABLE identity_capability.api_keys ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME identity_capability.api_keys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_account_links; Type: TABLE; Schema: identity_capability; Owner: -
--

CREATE TABLE identity_capability.auth_account_links (
    auth_user_id text NOT NULL,
    onboarding_state text DEFAULT 'incomplete'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id bigint,
    CONSTRAINT auth_account_links_onboarding_state_valid CHECK ((onboarding_state = ANY (ARRAY['incomplete'::text, 'complete'::text])))
);


--
-- Name: sessions; Type: TABLE; Schema: identity_capability; Owner: -
--

CREATE TABLE identity_capability.sessions (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash bytea NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    CONSTRAINT sessions_state_valid CHECK ((state = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: identity_capability; Owner: -
--

ALTER TABLE identity_capability.sessions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME identity_capability.sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_records; Type: TABLE; Schema: kernel; Owner: -
--

CREATE TABLE kernel.audit_records (
    id bigint NOT NULL,
    action text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    previous_state jsonb,
    new_state jsonb,
    correlation_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id bigint
);


--
-- Name: audit_records_id_seq; Type: SEQUENCE; Schema: kernel; Owner: -
--

ALTER TABLE kernel.audit_records ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME kernel.audit_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: idempotency_records; Type: TABLE; Schema: kernel; Owner: -
--

CREATE TABLE kernel.idempotency_records (
    scope text NOT NULL,
    idempotency_key text NOT NULL,
    result_reference uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    state text DEFAULT 'completed'::text NOT NULL,
    response jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT idempotency_records_state_valid CHECK ((state = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: outbox_events; Type: TABLE; Schema: kernel; Owner: -
--

CREATE TABLE kernel.outbox_events (
    id uuid NOT NULL,
    event_name text NOT NULL,
    aggregate_id uuid NOT NULL,
    correlation_id uuid NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    published_at timestamp with time zone,
    state text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    claimed_by text,
    last_error text,
    CONSTRAINT outbox_events_attempt_count_nonnegative CHECK ((attempt_count >= 0)),
    CONSTRAINT outbox_events_state_valid CHECK ((state = ANY (ARRAY['pending'::text, 'processing'::text, 'published'::text, 'failed'::text])))
);


--
-- Name: COLUMN outbox_events.aggregate_id; Type: COMMENT; Schema: kernel; Owner: -
--

COMMENT ON COLUMN kernel.outbox_events.aggregate_id IS 'Opaque UUID aggregate reference retained for event-contract compatibility.';


--
-- Name: COLUMN outbox_events.correlation_id; Type: COMMENT; Schema: kernel; Owner: -
--

COMMENT ON COLUMN kernel.outbox_events.correlation_id IS 'Opaque UUID event correlation identifier.';


--
-- Name: distribution_policy; Type: TABLE; Schema: ledger_capability; Owner: -
--

CREATE TABLE ledger_capability.distribution_policy (
    singleton boolean DEFAULT true NOT NULL,
    platform_account_uuid uuid NOT NULL,
    platform_rate_basis_points integer DEFAULT 0 NOT NULL,
    remainder_recipient text DEFAULT 'seller'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    initial_balance_state text DEFAULT 'pending'::text NOT NULL,
    settlement_delay_seconds integer DEFAULT 0 NOT NULL,
    CONSTRAINT distribution_policy_delay_valid CHECK ((settlement_delay_seconds >= 0)),
    CONSTRAINT distribution_policy_initial_state_valid CHECK ((initial_balance_state = ANY (ARRAY['pending'::text, 'available'::text]))),
    CONSTRAINT distribution_policy_rate_valid CHECK (((platform_rate_basis_points >= 0) AND (platform_rate_basis_points <= 10000))),
    CONSTRAINT distribution_policy_remainder_valid CHECK ((remainder_recipient = ANY (ARRAY['seller'::text, 'platform'::text]))),
    CONSTRAINT distribution_policy_singleton_check CHECK (singleton)
);


--
-- Name: TABLE distribution_policy; Type: COMMENT; Schema: ledger_capability; Owner: -
--

COMMENT ON TABLE ledger_capability.distribution_policy IS 'Legacy provider-backed distribution policy; new wallet purchases use validated distribution YAML.';


--
-- Name: entries; Type: TABLE; Schema: ledger_capability; Owner: -
--

CREATE TABLE ledger_capability.entries (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_type text NOT NULL,
    direction text NOT NULL,
    amount_minor bigint NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    idempotency_key text NOT NULL,
    correlation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_role text,
    basis text,
    referral_level integer,
    balance_state text DEFAULT 'available'::text NOT NULL,
    maturity_at timestamp with time zone,
    id bigint NOT NULL,
    account_id bigint,
    purchase_id bigint,
    distribution_id bigint,
    original_entry_id bigint,
    reversal_id bigint,
    CONSTRAINT ledger_entries_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT ledger_entries_balance_state_valid CHECK ((balance_state = ANY (ARRAY['pending'::text, 'available'::text]))),
    CONSTRAINT ledger_entries_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT ledger_entries_direction_valid CHECK ((direction = ANY (ARRAY['debit'::text, 'credit'::text]))),
    CONSTRAINT ledger_entries_recipient_role_valid CHECK ((recipient_role = ANY (ARRAY['seller'::text, 'referral'::text, 'platform'::text]))),
    CONSTRAINT ledger_entries_referral_level_valid CHECK (((referral_level IS NULL) OR (referral_level > 0)))
);


--
-- Name: TABLE entries; Type: COMMENT; Schema: ledger_capability; Owner: -
--

COMMENT ON TABLE ledger_capability.entries IS 'Append-only financial history; corrections require compensating entries.';


--
-- Name: entries_id_seq; Type: SEQUENCE; Schema: ledger_capability; Owner: -
--

ALTER TABLE ledger_capability.entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ledger_capability.entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: entry_settlements; Type: TABLE; Schema: ledger_capability; Owner: -
--

CREATE TABLE ledger_capability.entry_settlements (
    uuid uuid NOT NULL,
    from_state text NOT NULL,
    to_state text NOT NULL,
    idempotency_key text NOT NULL,
    settled_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    original_entry_id bigint NOT NULL,
    CONSTRAINT entry_settlements_states CHECK (((from_state = 'pending'::text) AND (to_state = 'available'::text)))
);


--
-- Name: entry_settlements_id_seq; Type: SEQUENCE; Schema: ledger_capability; Owner: -
--

ALTER TABLE ledger_capability.entry_settlements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ledger_capability.entry_settlements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: purchase_distributions; Type: TABLE; Schema: ledger_capability; Owner: -
--

CREATE TABLE ledger_capability.purchase_distributions (
    uuid uuid NOT NULL,
    gross_minor bigint NOT NULL,
    currency text NOT NULL,
    policy_snapshot jsonb NOT NULL,
    correlation_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    platform_amount_minor bigint DEFAULT 0 NOT NULL,
    id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    CONSTRAINT purchase_distributions_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT purchase_distributions_gross_nonnegative CHECK ((gross_minor >= 0)),
    CONSTRAINT purchase_distributions_platform_amount_minor_check CHECK ((platform_amount_minor >= 0))
);


--
-- Name: TABLE purchase_distributions; Type: COMMENT; Schema: ledger_capability; Owner: -
--

COMMENT ON TABLE ledger_capability.purchase_distributions IS 'One immutable, atomically committed financial distribution per completed purchase.';


--
-- Name: purchase_distributions_id_seq; Type: SEQUENCE; Schema: ledger_capability; Owner: -
--

ALTER TABLE ledger_capability.purchase_distributions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ledger_capability.purchase_distributions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reversals; Type: TABLE; Schema: ledger_capability; Owner: -
--

CREATE TABLE ledger_capability.reversals (
    uuid uuid NOT NULL,
    state text DEFAULT 'processed'::text NOT NULL,
    reason text NOT NULL,
    source text NOT NULL,
    idempotency_key text NOT NULL,
    correlation_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    distribution_id bigint NOT NULL,
    CONSTRAINT reversals_state_valid CHECK ((state = ANY (ARRAY['requested'::text, 'verified'::text, 'processed'::text, 'failed'::text])))
);


--
-- Name: reversals_id_seq; Type: SEQUENCE; Schema: ledger_capability; Owner: -
--

ALTER TABLE ledger_capability.reversals ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ledger_capability.reversals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: withdrawal_reservation_events; Type: TABLE; Schema: ledger_capability; Owner: -
--

CREATE TABLE ledger_capability.withdrawal_reservation_events (
    uuid uuid NOT NULL,
    kind text NOT NULL,
    amount_minor bigint NOT NULL,
    currency text NOT NULL,
    idempotency_key text NOT NULL,
    correlation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    reservation_id bigint NOT NULL,
    withdrawal_id bigint NOT NULL,
    account_id bigint NOT NULL,
    CONSTRAINT withdrawal_reservation_events_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT withdrawal_reservation_events_kind_valid CHECK ((kind = ANY (ARRAY['reserved'::text, 'released'::text, 'completed'::text])))
);


--
-- Name: withdrawal_reservation_events_id_seq; Type: SEQUENCE; Schema: ledger_capability; Owner: -
--

ALTER TABLE ledger_capability.withdrawal_reservation_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ledger_capability.withdrawal_reservation_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: withdrawal_reservations; Type: TABLE; Schema: ledger_capability; Owner: -
--

CREATE TABLE ledger_capability.withdrawal_reservations (
    uuid uuid NOT NULL,
    amount_minor bigint NOT NULL,
    currency text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    withdrawal_id bigint NOT NULL,
    account_id bigint NOT NULL,
    CONSTRAINT withdrawal_reservations_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT withdrawal_reservations_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text))
);


--
-- Name: withdrawal_reservations_id_seq; Type: SEQUENCE; Schema: ledger_capability; Owner: -
--

ALTER TABLE ledger_capability.withdrawal_reservations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ledger_capability.withdrawal_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: listings; Type: TABLE; Schema: listing_capability; Owner: -
--

CREATE TABLE listing_capability.listings (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    price_minor bigint NOT NULL,
    price_currency text NOT NULL,
    destination_url text NOT NULL,
    state text DEFAULT 'draft'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    external_key text,
    featured_position integer,
    id bigint NOT NULL,
    seller_id bigint NOT NULL,
    CONSTRAINT listings_currency_format CHECK ((price_currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT listings_external_key_format CHECK (((external_key IS NULL) OR (external_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text))),
    CONSTRAINT listings_featured_position_positive CHECK (((featured_position IS NULL) OR (featured_position > 0))),
    CONSTRAINT listings_price_nonnegative CHECK ((price_minor >= 0)),
    CONSTRAINT listings_state_valid CHECK ((state = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT listings_title_nonempty CHECK ((length(TRIM(BOTH FROM title)) > 0))
);


--
-- Name: listings_id_seq; Type: SEQUENCE; Schema: listing_capability; Owner: -
--

ALTER TABLE listing_capability.listings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME listing_capability.listings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: media; Type: TABLE; Schema: listing_capability; Owner: -
--

CREATE TABLE listing_capability.media (
    uuid uuid NOT NULL,
    storage_provider text NOT NULL,
    storage_container text NOT NULL,
    object_key text NOT NULL,
    mime_type text NOT NULL,
    original_filename text,
    byte_size bigint NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    "position" integer NOT NULL,
    alt_text text DEFAULT ''::text NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    deletion_requested_at timestamp with time zone,
    deletion_attempted_at timestamp with time zone,
    last_deletion_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    transfer_identity text,
    deletion_attempt_count integer DEFAULT 0 NOT NULL,
    deletion_next_attempt_at timestamp with time zone,
    deletion_claimed_at timestamp with time zone,
    deletion_lease_until timestamp with time zone,
    id bigint NOT NULL,
    listing_id bigint NOT NULL,
    CONSTRAINT media_byte_size_check CHECK ((byte_size > 0)),
    CONSTRAINT media_deletion_attempt_count_check CHECK ((deletion_attempt_count >= 0)),
    CONSTRAINT media_height_check CHECK ((height > 0)),
    CONSTRAINT media_position_check CHECK (("position" >= 0)),
    CONSTRAINT media_state_check CHECK ((state = ANY (ARRAY['active'::text, 'deletion_pending'::text, 'deleted'::text]))),
    CONSTRAINT media_width_check CHECK ((width > 0))
);


--
-- Name: TABLE media; Type: COMMENT; Schema: listing_capability; Owner: -
--

COMMENT ON TABLE listing_capability.media IS 'Provider-neutral listing image identity and durable deletion workflow. Public URLs are resolved through storage_provider plus container and object_key.';


--
-- Name: COLUMN media.transfer_identity; Type: COMMENT; Schema: listing_capability; Owner: -
--

COMMENT ON COLUMN listing_capability.media.transfer_identity IS 'Stable owner-scoped transfer identity used to reconcile imported galleries; not a storage locator.';


--
-- Name: media_id_seq; Type: SEQUENCE; Schema: listing_capability; Owner: -
--

ALTER TABLE listing_capability.media ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME listing_capability.media_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reviews; Type: TABLE; Schema: listing_capability; Owner: -
--

CREATE TABLE listing_capability.reviews (
    uuid uuid NOT NULL,
    rating smallint NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    status text NOT NULL,
    moderated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    listing_id bigint NOT NULL,
    account_id bigint NOT NULL,
    moderated_by bigint,
    CONSTRAINT reviews_body_check CHECK ((char_length(body) <= 2000)),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: listing_capability; Owner: -
--

ALTER TABLE listing_capability.reviews ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME listing_capability.reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: exchange_rates; Type: TABLE; Schema: money_capability; Owner: -
--

CREATE TABLE money_capability.exchange_rates (
    from_currency text NOT NULL,
    to_currency text NOT NULL,
    rate text NOT NULL,
    source text NOT NULL,
    source_date date,
    observed_at timestamp with time zone NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rates_currency_codes CHECK (((from_currency ~ '^[A-Z]{3}$'::text) AND (to_currency ~ '^[A-Z]{3}$'::text) AND (from_currency <> to_currency))),
    CONSTRAINT exchange_rates_positive CHECK (((rate ~ '^[0-9]+([.][0-9]+)?$'::text) AND (rate <> '0'::text)))
);


--
-- Name: payments; Type: TABLE; Schema: payment_capability; Owner: -
--

CREATE TABLE payment_capability.payments (
    uuid uuid NOT NULL,
    provider_name text NOT NULL,
    provider_reference text NOT NULL,
    provider_amount_minor bigint NOT NULL,
    provider_currency text NOT NULL,
    canonical_amount_minor bigint NOT NULL,
    canonical_currency text DEFAULT 'USD'::text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    idempotency_key text NOT NULL,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_transaction_id text,
    provider_verified_payload jsonb,
    provider_initialization jsonb,
    provider_fee_minor bigint,
    provider_fee_currency text,
    conversion_snapshot jsonb,
    initialization_attempt_count integer DEFAULT 0 NOT NULL,
    initialization_last_attempt_at timestamp with time zone,
    initialization_next_attempt_at timestamp with time zone,
    initialization_failure_kind text,
    initialization_last_error text,
    id bigint NOT NULL,
    buyer_id bigint NOT NULL,
    listing_id bigint NOT NULL,
    CONSTRAINT payments_amounts_nonnegative CHECK (((provider_amount_minor >= 0) AND (canonical_amount_minor >= 0))),
    CONSTRAINT payments_canonical_usd CHECK ((canonical_currency = 'USD'::text)),
    CONSTRAINT payments_provider_fee_currency_pair CHECK (((provider_fee_minor IS NULL) = (provider_fee_currency IS NULL))),
    CONSTRAINT payments_provider_fee_nonnegative CHECK (((provider_fee_minor IS NULL) OR (provider_fee_minor >= 0))),
    CONSTRAINT payments_state_valid CHECK ((state = ANY (ARRAY['pending'::text, 'initialization_pending'::text, 'initializing'::text, 'awaiting_payment'::text, 'verification_pending'::text, 'verifying'::text, 'initialization_failed'::text, 'initialization_blocked'::text, 'verification_blocked'::text, 'reconciliation_pending'::text, 'verified'::text, 'failed'::text])))
);


--
-- Name: COLUMN payments.provider_fee_minor; Type: COMMENT; Schema: payment_capability; Owner: -
--

COMMENT ON COLUMN payment_capability.payments.provider_fee_minor IS 'Provider-reported fee retained for audit; V1 distribution policy treats it as informational.';


--
-- Name: COLUMN payments.conversion_snapshot; Type: COMMENT; Schema: payment_capability; Owner: -
--

COMMENT ON COLUMN payment_capability.payments.conversion_snapshot IS 'Immutable canonical-to-provider collection conversion facts captured at checkout.';


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: payment_capability; Owner: -
--

ALTER TABLE payment_capability.payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME payment_capability.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: provider_events; Type: TABLE; Schema: payment_capability; Owner: -
--

CREATE TABLE payment_capability.provider_events (
    id uuid NOT NULL,
    provider_name text NOT NULL,
    event_key text NOT NULL,
    event_type text NOT NULL,
    provider_reference text,
    amount_minor bigint,
    currency text,
    payload jsonb NOT NULL,
    state text DEFAULT 'received'::text NOT NULL,
    last_error text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT provider_events_amount_nonnegative CHECK (((amount_minor IS NULL) OR (amount_minor >= 0))),
    CONSTRAINT provider_events_state_valid CHECK ((state = ANY (ARRAY['received'::text, 'processed'::text, 'rejected'::text, 'ignored'::text])))
);


--
-- Name: provider_operations; Type: TABLE; Schema: payment_capability; Owner: -
--

CREATE TABLE payment_capability.provider_operations (
    uuid uuid NOT NULL,
    provider text NOT NULL,
    operation text NOT NULL,
    outcome text NOT NULL,
    http_status integer,
    provider_status boolean,
    provider_message text,
    provider_code text,
    failure_kind text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    payment_id bigint,
    funding_id bigint,
    CONSTRAINT provider_operations_failure_fields_check CHECK ((((outcome = 'failed'::text) AND (provider_message IS NOT NULL) AND (failure_kind IS NOT NULL)) OR ((outcome = 'succeeded'::text) AND (failure_kind IS NULL)))),
    CONSTRAINT provider_operations_failure_kind_check CHECK ((failure_kind = ANY (ARRAY['rejection'::text, 'ambiguous'::text]))),
    CONSTRAINT provider_operations_outcome_check CHECK ((outcome = ANY (ARRAY['failed'::text, 'succeeded'::text])))
);


--
-- Name: provider_operations_id_seq; Type: SEQUENCE; Schema: payment_capability; Owner: -
--

ALTER TABLE payment_capability.provider_operations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME payment_capability.provider_operations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reconciliation_attempts; Type: TABLE; Schema: payment_capability; Owner: -
--

CREATE TABLE payment_capability.reconciliation_attempts (
    uuid uuid NOT NULL,
    idempotency_key text NOT NULL,
    state text NOT NULL,
    result jsonb,
    last_error text,
    correlation_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    id bigint NOT NULL,
    payment_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    CONSTRAINT reconciliation_attempt_state_valid CHECK ((state = ANY (ARRAY['started'::text, 'completed'::text, 'skipped'::text, 'mismatch'::text, 'failed'::text])))
);


--
-- Name: reconciliation_attempts_id_seq; Type: SEQUENCE; Schema: payment_capability; Owner: -
--

ALTER TABLE payment_capability.reconciliation_attempts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME payment_capability.reconciliation_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attempts; Type: TABLE; Schema: payout_capability; Owner: -
--

CREATE TABLE payout_capability.attempts (
    uuid uuid NOT NULL,
    provider_name text NOT NULL,
    provider_request_key text NOT NULL,
    provider_reference text,
    amount_minor bigint NOT NULL,
    currency text NOT NULL,
    state text NOT NULL,
    failure_category text,
    failure_reason text,
    provider_metadata jsonb,
    correlation_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    completed_at timestamp with time zone,
    id bigint NOT NULL,
    execution_id bigint NOT NULL,
    withdrawal_id bigint NOT NULL,
    CONSTRAINT payout_attempts_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT payout_attempts_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT payout_attempts_failure_category_valid CHECK (((failure_category IS NULL) OR (failure_category = ANY (ARRAY['retryable_technical'::text, 'permanent_validation'::text, 'provider_rejection'::text, 'unknown'::text, 'authenticated_provider_failure'::text])))),
    CONSTRAINT payout_attempts_number_positive CHECK ((attempt_number > 0)),
    CONSTRAINT payout_attempts_state_valid CHECK ((state = ANY (ARRAY['created'::text, 'submitted'::text, 'succeeded'::text, 'failed'::text, 'unknown'::text, 'pending'::text])))
);


--
-- Name: attempts_id_seq; Type: SEQUENCE; Schema: payout_capability; Owner: -
--

ALTER TABLE payout_capability.attempts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME payout_capability.attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: executions; Type: TABLE; Schema: payout_capability; Owner: -
--

CREATE TABLE payout_capability.executions (
    uuid uuid NOT NULL,
    provider_name text NOT NULL,
    idempotency_key text NOT NULL,
    state text DEFAULT 'ready'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    withdrawal_id bigint NOT NULL,
    CONSTRAINT payout_executions_attempt_nonnegative CHECK ((attempt_count >= 0)),
    CONSTRAINT payout_executions_state_valid CHECK ((state = ANY (ARRAY['ready'::text, 'submitted'::text, 'succeeded'::text, 'failed'::text, 'unknown'::text])))
);


--
-- Name: executions_id_seq; Type: SEQUENCE; Schema: payout_capability; Owner: -
--

ALTER TABLE payout_capability.executions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME payout_capability.executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: paystack_events; Type: TABLE; Schema: payout_capability; Owner: -
--

CREATE TABLE payout_capability.paystack_events (
    id uuid NOT NULL,
    event_key text NOT NULL,
    event_type text NOT NULL,
    provider_reference text NOT NULL,
    amount_minor text NOT NULL,
    currency text NOT NULL,
    payload jsonb NOT NULL,
    ignored_reason text,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: paystack_recipients; Type: TABLE; Schema: payout_capability; Owner: -
--

CREATE TABLE payout_capability.paystack_recipients (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    destination_fingerprint text NOT NULL,
    recipient_code text NOT NULL,
    bank_code text NOT NULL,
    account_last4 text NOT NULL,
    account_name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    account_id bigint NOT NULL
);


--
-- Name: paystack_recipients_id_seq; Type: SEQUENCE; Schema: payout_capability; Owner: -
--

ALTER TABLE payout_capability.paystack_recipients ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME payout_capability.paystack_recipients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: purchases; Type: TABLE; Schema: purchase_capability; Owner: -
--

CREATE TABLE purchase_capability.purchases (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    listing_title_snapshot text NOT NULL,
    price_minor_snapshot bigint NOT NULL,
    price_currency_snapshot text NOT NULL,
    canonical_minor_snapshot bigint NOT NULL,
    canonical_currency_snapshot text DEFAULT 'USD'::text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    buyer_id bigint NOT NULL,
    seller_id bigint NOT NULL,
    listing_id bigint NOT NULL,
    payment_id bigint,
    referral_attribution_id bigint,
    referral_referrer_account_id bigint,
    checkout_id bigint,
    CONSTRAINT purchases_canonical_usd CHECK ((canonical_currency_snapshot = 'USD'::text)),
    CONSTRAINT purchases_prices_nonnegative CHECK (((price_minor_snapshot >= 0) AND (canonical_minor_snapshot >= 0))),
    CONSTRAINT purchases_state_valid CHECK ((state = ANY (ARRAY['pending'::text, 'paid'::text, 'completed'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: TABLE purchases; Type: COMMENT; Schema: purchase_capability; Owner: -
--

COMMENT ON TABLE purchase_capability.purchases IS 'Immutable commercial snapshots remain authoritative after listing edits.';


--
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: purchase_capability; Owner: -
--

ALTER TABLE purchase_capability.purchases ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME purchase_capability.purchases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: account_referrals; Type: TABLE; Schema: referral_capability; Owner: -
--

CREATE TABLE referral_capability.account_referrals (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    child_account_id bigint NOT NULL,
    parent_account_id bigint NOT NULL
);


--
-- Name: TABLE account_referrals; Type: COMMENT; Schema: referral_capability; Owner: -
--

COMMENT ON TABLE referral_capability.account_referrals IS 'One-parent account referral hierarchy; parent reassignment is operator-controlled, recursive traversal is performed in PostgreSQL, and historical financial facts are not rewritten.';


--
-- Name: commission_policy; Type: TABLE; Schema: referral_capability; Owner: -
--

CREATE TABLE referral_capability.commission_policy (
    singleton boolean DEFAULT true NOT NULL,
    rates_basis_points integer[] DEFAULT '{}'::integer[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commission_policy_rates_valid CHECK (referral_capability.valid_commission_rates(rates_basis_points)),
    CONSTRAINT commission_policy_singleton_check CHECK (singleton)
);


--
-- Name: listing_attributions; Type: TABLE; Schema: referral_capability; Owner: -
--

CREATE TABLE referral_capability.listing_attributions (
    uuid uuid NOT NULL,
    token_hash bytea NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    id bigint NOT NULL,
    listing_id bigint NOT NULL,
    referrer_account_id bigint NOT NULL,
    CONSTRAINT listing_attributions_state_valid CHECK ((state = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: TABLE listing_attributions; Type: COMMENT; Schema: referral_capability; Owner: -
--

COMMENT ON TABLE referral_capability.listing_attributions IS 'Trusted server-resolved listing visit attribution; opaque browser tokens are stored only as hashes.';


--
-- Name: listing_attributions_id_seq; Type: SEQUENCE; Schema: referral_capability; Owner: -
--

ALTER TABLE referral_capability.listing_attributions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME referral_capability.listing_attributions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: entries; Type: TABLE; Schema: treasury_capability; Owner: -
--

CREATE TABLE treasury_capability.entries (
    uuid uuid NOT NULL,
    direction text NOT NULL,
    amount_minor bigint NOT NULL,
    title text NOT NULL,
    note text,
    source_kind text,
    source_id uuid,
    idempotency_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    actor_id bigint,
    CONSTRAINT entries_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT entries_direction_check CHECK ((direction = ANY (ARRAY['credit'::text, 'debit'::text]))),
    CONSTRAINT treasury_source_pair CHECK (((source_kind IS NULL) = (source_id IS NULL)))
);


--
-- Name: TABLE entries; Type: COMMENT; Schema: treasury_capability; Owner: -
--

COMMENT ON TABLE treasury_capability.entries IS 'Append-only canonical USD company treasury facts; balance is a projection over entries.';


--
-- Name: COLUMN entries.source_id; Type: COMMENT; Schema: treasury_capability; Owner: -
--

COMMENT ON COLUMN treasury_capability.entries.source_id IS 'Polymorphic external/business source identifier; not a relational foreign key.';


--
-- Name: entries_id_seq; Type: SEQUENCE; Schema: treasury_capability; Owner: -
--

ALTER TABLE treasury_capability.entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME treasury_capability.entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: credits; Type: TABLE; Schema: wallet_capability; Owner: -
--

CREATE TABLE wallet_capability.credits (
    uuid uuid NOT NULL,
    amount_minor bigint NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    available_at timestamp with time zone,
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    funding_id bigint NOT NULL,
    CONSTRAINT wallet_credit_positive CHECK ((amount_minor > 0)),
    CONSTRAINT wallet_credit_state_valid CHECK ((state = ANY (ARRAY['pending'::text, 'available'::text]))),
    CONSTRAINT wallet_credit_usd CHECK ((currency = 'USD'::text))
);


--
-- Name: credits_id_seq; Type: SEQUENCE; Schema: wallet_capability; Owner: -
--

ALTER TABLE wallet_capability.credits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME wallet_capability.credits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: debits; Type: TABLE; Schema: wallet_capability; Owner: -
--

CREATE TABLE wallet_capability.debits (
    uuid uuid NOT NULL,
    amount_minor bigint NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    checkout_id bigint NOT NULL,
    CONSTRAINT wallet_debit_positive CHECK ((amount_minor > 0)),
    CONSTRAINT wallet_debit_usd CHECK ((currency = 'USD'::text))
);


--
-- Name: debits_id_seq; Type: SEQUENCE; Schema: wallet_capability; Owner: -
--

ALTER TABLE wallet_capability.debits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME wallet_capability.debits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: policy; Type: TABLE; Schema: withdrawal_capability; Owner: -
--

CREATE TABLE withdrawal_capability.policy (
    singleton boolean DEFAULT true NOT NULL,
    minimum_amount_minor bigint DEFAULT 100 NOT NULL,
    maximum_amount_minor bigint,
    currency text DEFAULT 'USD'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT policy_singleton_check CHECK (singleton),
    CONSTRAINT withdrawal_policy_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT withdrawal_policy_max_valid CHECK (((maximum_amount_minor IS NULL) OR (maximum_amount_minor >= minimum_amount_minor))),
    CONSTRAINT withdrawal_policy_min_positive CHECK ((minimum_amount_minor > 0))
);


--
-- Name: withdrawals; Type: TABLE; Schema: withdrawal_capability; Owner: -
--

CREATE TABLE withdrawal_capability.withdrawals (
    uuid uuid NOT NULL,
    amount_minor bigint NOT NULL,
    currency text NOT NULL,
    destination_type text NOT NULL,
    destination_reference text NOT NULL,
    state text DEFAULT 'requested'::text NOT NULL,
    idempotency_key text NOT NULL,
    correlation_id uuid NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    completed_at timestamp with time zone,
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    CONSTRAINT withdrawals_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT withdrawals_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT withdrawals_destination_type_valid CHECK ((destination_type = ANY (ARRAY['bank'::text, 'manual'::text]))),
    CONSTRAINT withdrawals_state_valid CHECK ((state = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: withdrawals_id_seq; Type: SEQUENCE; Schema: withdrawal_capability; Owner: -
--

ALTER TABLE withdrawal_capability.withdrawals ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME withdrawal_capability.withdrawals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: access_grants access_grants_idempotency_unique; Type: CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.access_grants
    ADD CONSTRAINT access_grants_idempotency_unique UNIQUE (idempotency_key);


--
-- Name: access_grants access_grants_pkey; Type: CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.access_grants
    ADD CONSTRAINT access_grants_pkey PRIMARY KEY (id);


--
-- Name: access_grants access_grants_token_hash_unique; Type: CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.access_grants
    ADD CONSTRAINT access_grants_token_hash_unique UNIQUE (token_hash);


--
-- Name: access_grants access_grants_uuid_unique; Type: CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.access_grants
    ADD CONSTRAINT access_grants_uuid_unique UNIQUE (uuid);


--
-- Name: integration_listings integration_listings_pkey; Type: CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.integration_listings
    ADD CONSTRAINT integration_listings_pkey PRIMARY KEY (integration_id, listing_id);


--
-- Name: integrations integrations_credential_hash_unique; Type: CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.integrations
    ADD CONSTRAINT integrations_credential_hash_unique UNIQUE (credential_hash);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_uuid_unique; Type: CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.integrations
    ADD CONSTRAINT integrations_uuid_unique UNIQUE (uuid);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: account better_auth_account_provider_identity_unique; Type: CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth.account
    ADD CONSTRAINT better_auth_account_provider_identity_unique UNIQUE ("providerId", "accountId");


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: checkouts checkout_idempotency_unique_numeric; Type: CONSTRAINT; Schema: checkout_capability; Owner: -
--

ALTER TABLE ONLY checkout_capability.checkouts
    ADD CONSTRAINT checkout_idempotency_unique_numeric UNIQUE (buyer_id, idempotency_key);


--
-- Name: checkouts checkouts_pkey; Type: CONSTRAINT; Schema: checkout_capability; Owner: -
--

ALTER TABLE ONLY checkout_capability.checkouts
    ADD CONSTRAINT checkouts_pkey PRIMARY KEY (id);


--
-- Name: checkouts checkouts_uuid_unique; Type: CONSTRAINT; Schema: checkout_capability; Owner: -
--

ALTER TABLE ONLY checkout_capability.checkouts
    ADD CONSTRAINT checkouts_uuid_unique UNIQUE (uuid);


--
-- Name: entitlements entitlements_pkey; Type: CONSTRAINT; Schema: entitlement_capability; Owner: -
--

ALTER TABLE ONLY entitlement_capability.entitlements
    ADD CONSTRAINT entitlements_pkey PRIMARY KEY (id);


--
-- Name: entitlements entitlements_purchase_unique_numeric; Type: CONSTRAINT; Schema: entitlement_capability; Owner: -
--

ALTER TABLE ONLY entitlement_capability.entitlements
    ADD CONSTRAINT entitlements_purchase_unique_numeric UNIQUE (purchase_id);


--
-- Name: entitlements entitlements_uuid_unique; Type: CONSTRAINT; Schema: entitlement_capability; Owner: -
--

ALTER TABLE ONLY entitlement_capability.entitlements
    ADD CONSTRAINT entitlements_uuid_unique UNIQUE (uuid);


--
-- Name: funding_transactions funding_idempotency_unique; Type: CONSTRAINT; Schema: funding_capability; Owner: -
--

ALTER TABLE ONLY funding_capability.funding_transactions
    ADD CONSTRAINT funding_idempotency_unique UNIQUE (account_id, idempotency_key);


--
-- Name: funding_transactions funding_reference_unique; Type: CONSTRAINT; Schema: funding_capability; Owner: -
--

ALTER TABLE ONLY funding_capability.funding_transactions
    ADD CONSTRAINT funding_reference_unique UNIQUE (provider_name, provider_reference);


--
-- Name: funding_transactions funding_transactions_pkey; Type: CONSTRAINT; Schema: funding_capability; Owner: -
--

ALTER TABLE ONLY funding_capability.funding_transactions
    ADD CONSTRAINT funding_transactions_pkey PRIMARY KEY (id);


--
-- Name: funding_transactions funding_transactions_uuid_unique; Type: CONSTRAINT; Schema: funding_capability; Owner: -
--

ALTER TABLE ONLY funding_capability.funding_transactions
    ADD CONSTRAINT funding_transactions_uuid_unique UNIQUE (uuid);


--
-- Name: account_capabilities account_capabilities_pkey; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.account_capabilities
    ADD CONSTRAINT account_capabilities_pkey PRIMARY KEY (account_id, capability);


--
-- Name: accounts accounts_username_unique; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.accounts
    ADD CONSTRAINT accounts_username_unique UNIQUE (username);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_uuid_unique; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.accounts
    ADD CONSTRAINT accounts_uuid_unique UNIQUE (uuid);


--
-- Name: api_keys api_keys_key_prefix_key; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.api_keys
    ADD CONSTRAINT api_keys_key_prefix_key UNIQUE (key_prefix);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_secret_hash_key; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.api_keys
    ADD CONSTRAINT api_keys_secret_hash_key UNIQUE (secret_hash);


--
-- Name: api_keys api_keys_uuid_unique; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.api_keys
    ADD CONSTRAINT api_keys_uuid_unique UNIQUE (uuid);


--
-- Name: auth_account_links auth_account_links_pkey; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.auth_account_links
    ADD CONSTRAINT auth_account_links_pkey PRIMARY KEY (auth_user_id);


--
-- Name: auth_account_links auth_account_links_account_unique; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.auth_account_links
    ADD CONSTRAINT auth_account_links_account_unique UNIQUE (account_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_unique; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.sessions
    ADD CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash);


--
-- Name: sessions sessions_uuid_unique; Type: CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.sessions
    ADD CONSTRAINT sessions_uuid_unique UNIQUE (uuid);


--
-- Name: audit_records audit_records_pkey; Type: CONSTRAINT; Schema: kernel; Owner: -
--

ALTER TABLE ONLY kernel.audit_records
    ADD CONSTRAINT audit_records_pkey PRIMARY KEY (id);


--
-- Name: idempotency_records idempotency_records_pkey; Type: CONSTRAINT; Schema: kernel; Owner: -
--

ALTER TABLE ONLY kernel.idempotency_records
    ADD CONSTRAINT idempotency_records_pkey PRIMARY KEY (scope, idempotency_key);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: kernel; Owner: -
--

ALTER TABLE ONLY kernel.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: distribution_policy distribution_policy_pkey; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.distribution_policy
    ADD CONSTRAINT distribution_policy_pkey PRIMARY KEY (singleton);


--
-- Name: entries entries_pkey; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (id);


--
-- Name: entries entries_uuid_unique; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entries
    ADD CONSTRAINT entries_uuid_unique UNIQUE (uuid);


--
-- Name: entry_settlements entry_settlements_entry_unique_numeric; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entry_settlements
    ADD CONSTRAINT entry_settlements_entry_unique_numeric UNIQUE (original_entry_id);


--
-- Name: entry_settlements entry_settlements_idempotency_key_key; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entry_settlements
    ADD CONSTRAINT entry_settlements_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: entry_settlements entry_settlements_pkey; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entry_settlements
    ADD CONSTRAINT entry_settlements_pkey PRIMARY KEY (id);


--
-- Name: entry_settlements entry_settlements_uuid_unique; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entry_settlements
    ADD CONSTRAINT entry_settlements_uuid_unique UNIQUE (uuid);


--
-- Name: entries ledger_entries_idempotency_unique; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entries
    ADD CONSTRAINT ledger_entries_idempotency_unique UNIQUE (idempotency_key);


--
-- Name: purchase_distributions purchase_distributions_pkey; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.purchase_distributions
    ADD CONSTRAINT purchase_distributions_pkey PRIMARY KEY (id);


--
-- Name: purchase_distributions purchase_distributions_uuid_unique; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.purchase_distributions
    ADD CONSTRAINT purchase_distributions_uuid_unique UNIQUE (uuid);


--
-- Name: reversals reversals_idempotency_key_key; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.reversals
    ADD CONSTRAINT reversals_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: reversals reversals_pkey; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.reversals
    ADD CONSTRAINT reversals_pkey PRIMARY KEY (id);


--
-- Name: reversals reversals_purchase_unique_numeric; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.reversals
    ADD CONSTRAINT reversals_purchase_unique_numeric UNIQUE (purchase_id);


--
-- Name: reversals reversals_uuid_unique; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.reversals
    ADD CONSTRAINT reversals_uuid_unique UNIQUE (uuid);


--
-- Name: withdrawal_reservation_events withdrawal_reservation_events_idempotency_key_key; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservation_events
    ADD CONSTRAINT withdrawal_reservation_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: withdrawal_reservation_events withdrawal_reservation_events_pkey; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservation_events
    ADD CONSTRAINT withdrawal_reservation_events_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_reservation_events withdrawal_reservation_events_uuid_unique; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservation_events
    ADD CONSTRAINT withdrawal_reservation_events_uuid_unique UNIQUE (uuid);


--
-- Name: withdrawal_reservations withdrawal_reservations_pkey; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservations
    ADD CONSTRAINT withdrawal_reservations_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_reservations withdrawal_reservations_uuid_unique; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservations
    ADD CONSTRAINT withdrawal_reservations_uuid_unique UNIQUE (uuid);


--
-- Name: withdrawal_reservations withdrawal_reservations_withdrawal_unique_numeric; Type: CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservations
    ADD CONSTRAINT withdrawal_reservations_withdrawal_unique_numeric UNIQUE (withdrawal_id);


--
-- Name: media listing_media_storage_identity_unique; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.media
    ADD CONSTRAINT listing_media_storage_identity_unique UNIQUE (storage_provider, storage_container, object_key);


--
-- Name: reviews listing_reviews_one_per_account; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.reviews
    ADD CONSTRAINT listing_reviews_one_per_account UNIQUE (listing_id, account_id);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: listings listings_seller_external_key_unique; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.listings
    ADD CONSTRAINT listings_seller_external_key_unique UNIQUE (seller_id, external_key);


--
-- Name: listings listings_uuid_unique; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.listings
    ADD CONSTRAINT listings_uuid_unique UNIQUE (uuid);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: media media_uuid_unique; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.media
    ADD CONSTRAINT media_uuid_unique UNIQUE (uuid);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_uuid_unique; Type: CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.reviews
    ADD CONSTRAINT reviews_uuid_unique UNIQUE (uuid);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: money_capability; Owner: -
--

ALTER TABLE ONLY money_capability.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (from_currency, to_currency);


--
-- Name: payments payments_idempotency_unique; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.payments
    ADD CONSTRAINT payments_idempotency_unique UNIQUE (idempotency_key);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_provider_reference_unique; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.payments
    ADD CONSTRAINT payments_provider_reference_unique UNIQUE (provider_name, provider_reference);


--
-- Name: payments payments_uuid_unique; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.payments
    ADD CONSTRAINT payments_uuid_unique UNIQUE (uuid);


--
-- Name: provider_events provider_events_identity_unique; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.provider_events
    ADD CONSTRAINT provider_events_identity_unique UNIQUE (provider_name, event_key);


--
-- Name: provider_events provider_events_pkey; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.provider_events
    ADD CONSTRAINT provider_events_pkey PRIMARY KEY (id);


--
-- Name: provider_operations provider_operations_pkey; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.provider_operations
    ADD CONSTRAINT provider_operations_pkey PRIMARY KEY (id);


--
-- Name: provider_operations provider_operations_uuid_unique; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.provider_operations
    ADD CONSTRAINT provider_operations_uuid_unique UNIQUE (uuid);


--
-- Name: reconciliation_attempts reconciliation_attempt_identity_unique_numeric; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.reconciliation_attempts
    ADD CONSTRAINT reconciliation_attempt_identity_unique_numeric UNIQUE (payment_id, idempotency_key);


--
-- Name: reconciliation_attempts reconciliation_attempts_pkey; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.reconciliation_attempts
    ADD CONSTRAINT reconciliation_attempts_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_attempts reconciliation_attempts_uuid_unique; Type: CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.reconciliation_attempts
    ADD CONSTRAINT reconciliation_attempts_uuid_unique UNIQUE (uuid);


--
-- Name: attempts attempts_pkey; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.attempts
    ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);


--
-- Name: attempts attempts_uuid_unique; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.attempts
    ADD CONSTRAINT attempts_uuid_unique UNIQUE (uuid);


--
-- Name: executions executions_idempotency_key_key; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.executions
    ADD CONSTRAINT executions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: executions executions_pkey; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.executions
    ADD CONSTRAINT executions_pkey PRIMARY KEY (id);


--
-- Name: executions executions_uuid_unique; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.executions
    ADD CONSTRAINT executions_uuid_unique UNIQUE (uuid);


--
-- Name: attempts payout_attempts_request_unique_numeric; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.attempts
    ADD CONSTRAINT payout_attempts_request_unique_numeric UNIQUE (execution_id, attempt_number);


--
-- Name: executions payout_executions_withdrawal_unique_numeric; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.executions
    ADD CONSTRAINT payout_executions_withdrawal_unique_numeric UNIQUE (withdrawal_id);


--
-- Name: paystack_events paystack_events_event_key_key; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.paystack_events
    ADD CONSTRAINT paystack_events_event_key_key UNIQUE (event_key);


--
-- Name: paystack_events paystack_events_pkey; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.paystack_events
    ADD CONSTRAINT paystack_events_pkey PRIMARY KEY (id);


--
-- Name: paystack_recipients paystack_recipients_pkey; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.paystack_recipients
    ADD CONSTRAINT paystack_recipients_pkey PRIMARY KEY (id);


--
-- Name: paystack_recipients paystack_recipients_recipient_code_key; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.paystack_recipients
    ADD CONSTRAINT paystack_recipients_recipient_code_key UNIQUE (recipient_code);


--
-- Name: paystack_recipients paystack_recipients_uuid_unique; Type: CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.paystack_recipients
    ADD CONSTRAINT paystack_recipients_uuid_unique UNIQUE (uuid);


--
-- Name: purchases purchases_checkout_unique_numeric; Type: CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_checkout_unique_numeric UNIQUE (checkout_id);


--
-- Name: purchases purchases_idempotency_unique; Type: CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_idempotency_unique UNIQUE (idempotency_key);


--
-- Name: purchases purchases_payment_unique_numeric; Type: CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_payment_unique_numeric UNIQUE (payment_id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_uuid_unique; Type: CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_uuid_unique UNIQUE (uuid);


--
-- Name: account_referrals account_referrals_pkey; Type: CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.account_referrals
    ADD CONSTRAINT account_referrals_pkey PRIMARY KEY (child_account_id);


--
-- Name: commission_policy commission_policy_pkey; Type: CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.commission_policy
    ADD CONSTRAINT commission_policy_pkey PRIMARY KEY (singleton);


--
-- Name: listing_attributions listing_attributions_pkey; Type: CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.listing_attributions
    ADD CONSTRAINT listing_attributions_pkey PRIMARY KEY (id);


--
-- Name: listing_attributions listing_attributions_token_hash_key; Type: CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.listing_attributions
    ADD CONSTRAINT listing_attributions_token_hash_key UNIQUE (token_hash);


--
-- Name: listing_attributions listing_attributions_uuid_unique; Type: CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.listing_attributions
    ADD CONSTRAINT listing_attributions_uuid_unique UNIQUE (uuid);


--
-- Name: entries entries_idempotency_key_key; Type: CONSTRAINT; Schema: treasury_capability; Owner: -
--

ALTER TABLE ONLY treasury_capability.entries
    ADD CONSTRAINT entries_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: entries entries_pkey; Type: CONSTRAINT; Schema: treasury_capability; Owner: -
--

ALTER TABLE ONLY treasury_capability.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (id);


--
-- Name: entries entries_uuid_unique; Type: CONSTRAINT; Schema: treasury_capability; Owner: -
--

ALTER TABLE ONLY treasury_capability.entries
    ADD CONSTRAINT entries_uuid_unique UNIQUE (uuid);


--
-- Name: credits credits_pkey; Type: CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.credits
    ADD CONSTRAINT credits_pkey PRIMARY KEY (id);


--
-- Name: credits credits_uuid_unique; Type: CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.credits
    ADD CONSTRAINT credits_uuid_unique UNIQUE (uuid);


--
-- Name: debits debits_pkey; Type: CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.debits
    ADD CONSTRAINT debits_pkey PRIMARY KEY (id);


--
-- Name: debits debits_uuid_unique; Type: CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.debits
    ADD CONSTRAINT debits_uuid_unique UNIQUE (uuid);


--
-- Name: credits wallet_credit_funding_unique_numeric; Type: CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.credits
    ADD CONSTRAINT wallet_credit_funding_unique_numeric UNIQUE (funding_id);


--
-- Name: debits wallet_debit_checkout_unique_numeric; Type: CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.debits
    ADD CONSTRAINT wallet_debit_checkout_unique_numeric UNIQUE (checkout_id);


--
-- Name: policy policy_pkey; Type: CONSTRAINT; Schema: withdrawal_capability; Owner: -
--

ALTER TABLE ONLY withdrawal_capability.policy
    ADD CONSTRAINT policy_pkey PRIMARY KEY (singleton);


--
-- Name: withdrawals withdrawals_idempotency_key_key; Type: CONSTRAINT; Schema: withdrawal_capability; Owner: -
--

ALTER TABLE ONLY withdrawal_capability.withdrawals
    ADD CONSTRAINT withdrawals_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: withdrawal_capability; Owner: -
--

ALTER TABLE ONLY withdrawal_capability.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);


--
-- Name: withdrawals withdrawals_uuid_unique; Type: CONSTRAINT; Schema: withdrawal_capability; Owner: -
--

ALTER TABLE ONLY withdrawal_capability.withdrawals
    ADD CONSTRAINT withdrawals_uuid_unique UNIQUE (uuid);


--
-- Name: access_grants_entitlement_idx; Type: INDEX; Schema: access_capability; Owner: -
--

CREATE INDEX access_grants_entitlement_idx ON access_capability.access_grants USING btree (entitlement_id, created_at DESC);


--
-- Name: integration_listings_listing_idx; Type: INDEX; Schema: access_capability; Owner: -
--

CREATE INDEX integration_listings_listing_idx ON access_capability.integration_listings USING btree (listing_id);


--
-- Name: better_auth_account_user_idx; Type: INDEX; Schema: better_auth; Owner: -
--

CREATE INDEX better_auth_account_user_idx ON better_auth.account USING btree ("userId");


--
-- Name: better_auth_session_user_idx; Type: INDEX; Schema: better_auth; Owner: -
--

CREATE INDEX better_auth_session_user_idx ON better_auth.session USING btree ("userId");


--
-- Name: better_auth_verification_identifier_idx; Type: INDEX; Schema: better_auth; Owner: -
--

CREATE INDEX better_auth_verification_identifier_idx ON better_auth.verification USING btree (identifier);


--
-- Name: checkout_buyer_idx; Type: INDEX; Schema: checkout_capability; Owner: -
--

CREATE INDEX checkout_buyer_idx ON checkout_capability.checkouts USING btree (buyer_id, created_at DESC);


--
-- Name: checkout_work_idx; Type: INDEX; Schema: checkout_capability; Owner: -
--

CREATE INDEX checkout_work_idx ON checkout_capability.checkouts USING btree (state, created_at, id);


--
-- Name: entitlements_buyer_listing_idx; Type: INDEX; Schema: entitlement_capability; Owner: -
--

CREATE INDEX entitlements_buyer_listing_idx ON entitlement_capability.entitlements USING btree (buyer_id, listing_id);


--
-- Name: funding_account_idx; Type: INDEX; Schema: funding_capability; Owner: -
--

CREATE INDEX funding_account_idx ON funding_capability.funding_transactions USING btree (account_id, created_at DESC);


--
-- Name: funding_initialization_claimable_idx; Type: INDEX; Schema: funding_capability; Owner: -
--

CREATE INDEX funding_initialization_claimable_idx ON funding_capability.funding_transactions USING btree (state, initialization_claimed_at, updated_at, id) WHERE (state = ANY (ARRAY['initialization_pending'::text, 'initializing'::text]));


--
-- Name: funding_work_idx; Type: INDEX; Schema: funding_capability; Owner: -
--

CREATE INDEX funding_work_idx ON funding_capability.funding_transactions USING btree (state, updated_at, id);


--
-- Name: accounts_created_idx; Type: INDEX; Schema: identity_capability; Owner: -
--

CREATE INDEX accounts_created_idx ON identity_capability.accounts USING btree (created_at DESC, id DESC);


--
-- Name: api_keys_account_idx; Type: INDEX; Schema: identity_capability; Owner: -
--

CREATE INDEX api_keys_account_idx ON identity_capability.api_keys USING btree (account_id, created_at DESC);


--
-- Name: api_keys_active_prefix_idx; Type: INDEX; Schema: identity_capability; Owner: -
--

CREATE INDEX api_keys_active_prefix_idx ON identity_capability.api_keys USING btree (key_prefix) WHERE (revoked_at IS NULL);


--
-- Name: sessions_account_idx; Type: INDEX; Schema: identity_capability; Owner: -
--

CREATE INDEX sessions_account_idx ON identity_capability.sessions USING btree (account_id, created_at DESC);


--
-- Name: audit_records_correlation_idx; Type: INDEX; Schema: kernel; Owner: -
--

CREATE INDEX audit_records_correlation_idx ON kernel.audit_records USING btree (correlation_id);


--
-- Name: audit_records_subject_idx; Type: INDEX; Schema: kernel; Owner: -
--

CREATE INDEX audit_records_subject_idx ON kernel.audit_records USING btree (subject_type, subject_id, occurred_at DESC);


--
-- Name: outbox_events_claimable_idx; Type: INDEX; Schema: kernel; Owner: -
--

CREATE INDEX outbox_events_claimable_idx ON kernel.outbox_events USING btree (available_at, occurred_at) WHERE (state = ANY (ARRAY['pending'::text, 'failed'::text]));


--
-- Name: entry_settlements_entry_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX entry_settlements_entry_idx ON ledger_capability.entry_settlements USING btree (original_entry_id);


--
-- Name: ledger_entries_account_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX ledger_entries_account_idx ON ledger_capability.entries USING btree (account_id, created_at DESC);


--
-- Name: ledger_entries_account_summary_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX ledger_entries_account_summary_idx ON ledger_capability.entries USING btree (account_id, currency, balance_state, direction);


--
-- Name: ledger_entries_distribution_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX ledger_entries_distribution_idx ON ledger_capability.entries USING btree (distribution_id);


--
-- Name: ledger_entries_purchase_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX ledger_entries_purchase_idx ON ledger_capability.entries USING btree (purchase_id) WHERE (purchase_id IS NOT NULL);


--
-- Name: ledger_entries_reversal_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX ledger_entries_reversal_idx ON ledger_capability.entries USING btree (reversal_id) WHERE (reversal_id IS NOT NULL);


--
-- Name: ledger_entries_settlement_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX ledger_entries_settlement_idx ON ledger_capability.entries USING btree (maturity_at, id) WHERE ((balance_state = 'pending'::text) AND (maturity_at IS NOT NULL));


--
-- Name: reversals_distribution_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX reversals_distribution_idx ON ledger_capability.reversals USING btree (distribution_id);


--
-- Name: withdrawal_reservation_events_latest_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX withdrawal_reservation_events_latest_idx ON ledger_capability.withdrawal_reservation_events USING btree (reservation_id, created_at DESC, id DESC);


--
-- Name: withdrawal_reservations_account_idx; Type: INDEX; Schema: ledger_capability; Owner: -
--

CREATE INDEX withdrawal_reservations_account_idx ON ledger_capability.withdrawal_reservations USING btree (account_id, currency);


--
-- Name: listing_media_active_position_unique; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE UNIQUE INDEX listing_media_active_position_unique ON listing_capability.media USING btree (listing_id, "position") WHERE (state = 'active'::text);


--
-- Name: listing_media_active_transfer_identity_unique; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE UNIQUE INDEX listing_media_active_transfer_identity_unique ON listing_capability.media USING btree (listing_id, transfer_identity) WHERE ((state = 'active'::text) AND (transfer_identity IS NOT NULL));


--
-- Name: listing_media_deletion_due_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listing_media_deletion_due_idx ON listing_capability.media USING btree (deletion_next_attempt_at, deletion_lease_until, id) WHERE (state = 'deletion_pending'::text);


--
-- Name: listing_media_order_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listing_media_order_idx ON listing_capability.media USING btree (listing_id, state, "position", created_at, id);


--
-- Name: listing_reviews_moderation_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listing_reviews_moderation_idx ON listing_capability.reviews USING btree (status, created_at, id);


--
-- Name: listing_reviews_public_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listing_reviews_public_idx ON listing_capability.reviews USING btree (listing_id, created_at DESC, id DESC) WHERE (status = 'approved'::text);


--
-- Name: listings_featured_position_unique; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE UNIQUE INDEX listings_featured_position_unique ON listing_capability.listings USING btree (featured_position) WHERE (featured_position IS NOT NULL);


--
-- Name: listings_owner_query_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listings_owner_query_idx ON listing_capability.listings USING btree (seller_id, state, created_at DESC, id DESC);


--
-- Name: listings_public_featured_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listings_public_featured_idx ON listing_capability.listings USING btree (featured_position, id) WHERE ((state = 'published'::text) AND (featured_position IS NOT NULL));


--
-- Name: listings_public_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listings_public_idx ON listing_capability.listings USING btree (created_at DESC) WHERE (state = 'published'::text);


--
-- Name: listings_public_query_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listings_public_query_idx ON listing_capability.listings USING btree (state, created_at DESC, id DESC);


--
-- Name: listings_search_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listings_search_idx ON listing_capability.listings USING gin (to_tsvector('simple'::regconfig, ((title || ' '::text) || description)));


--
-- Name: listings_seller_idx; Type: INDEX; Schema: listing_capability; Owner: -
--

CREATE INDEX listings_seller_idx ON listing_capability.listings USING btree (seller_id, created_at DESC);


--
-- Name: payment_buyer_idx; Type: INDEX; Schema: payment_capability; Owner: -
--

CREATE INDEX payment_buyer_idx ON payment_capability.payments USING btree (buyer_id, created_at DESC);


--
-- Name: payment_listing_idx; Type: INDEX; Schema: payment_capability; Owner: -
--

CREATE INDEX payment_listing_idx ON payment_capability.payments USING btree (listing_id, created_at DESC);


--
-- Name: payments_pending_paystack_idx; Type: INDEX; Schema: payment_capability; Owner: -
--

CREATE INDEX payments_pending_paystack_idx ON payment_capability.payments USING btree (created_at, id) WHERE ((provider_name = 'paystack'::text) AND (state = 'pending'::text));


--
-- Name: provider_events_reference_idx; Type: INDEX; Schema: payment_capability; Owner: -
--

CREATE INDEX provider_events_reference_idx ON payment_capability.provider_events USING btree (provider_name, provider_reference) WHERE (provider_reference IS NOT NULL);


--
-- Name: provider_events_state_idx; Type: INDEX; Schema: payment_capability; Owner: -
--

CREATE INDEX provider_events_state_idx ON payment_capability.provider_events USING btree (state, received_at) WHERE (state = ANY (ARRAY['received'::text, 'rejected'::text]));


--
-- Name: provider_operations_funding_idx; Type: INDEX; Schema: payment_capability; Owner: -
--

CREATE INDEX provider_operations_funding_idx ON payment_capability.provider_operations USING btree (funding_id, occurred_at DESC) WHERE (funding_id IS NOT NULL);


--
-- Name: provider_operations_payment_idx; Type: INDEX; Schema: payment_capability; Owner: -
--

CREATE INDEX provider_operations_payment_idx ON payment_capability.provider_operations USING btree (payment_id, occurred_at DESC);


--
-- Name: reconciliation_attempts_payment_idx; Type: INDEX; Schema: payment_capability; Owner: -
--

CREATE INDEX reconciliation_attempts_payment_idx ON payment_capability.reconciliation_attempts USING btree (payment_id, started_at DESC);


--
-- Name: payout_attempts_reference_idx; Type: INDEX; Schema: payout_capability; Owner: -
--

CREATE INDEX payout_attempts_reference_idx ON payout_capability.attempts USING btree (provider_name, provider_reference) WHERE (provider_reference IS NOT NULL);


--
-- Name: payout_attempts_withdrawal_idx; Type: INDEX; Schema: payout_capability; Owner: -
--

CREATE INDEX payout_attempts_withdrawal_idx ON payout_capability.attempts USING btree (withdrawal_id, created_at DESC);


--
-- Name: payout_executions_retry_idx; Type: INDEX; Schema: payout_capability; Owner: -
--

CREATE INDEX payout_executions_retry_idx ON payout_capability.executions USING btree (state, next_attempt_at) WHERE (state = ANY (ARRAY['failed'::text, 'unknown'::text]));


--
-- Name: paystack_events_reference_idx; Type: INDEX; Schema: payout_capability; Owner: -
--

CREATE INDEX paystack_events_reference_idx ON payout_capability.paystack_events USING btree (provider_reference);


--
-- Name: paystack_recipients_account_idx; Type: INDEX; Schema: payout_capability; Owner: -
--

CREATE INDEX paystack_recipients_account_idx ON payout_capability.paystack_recipients USING btree (account_id);


--
-- Name: purchases_buyer_idx; Type: INDEX; Schema: purchase_capability; Owner: -
--

CREATE INDEX purchases_buyer_idx ON purchase_capability.purchases USING btree (buyer_id, created_at DESC);


--
-- Name: purchases_listing_idx; Type: INDEX; Schema: purchase_capability; Owner: -
--

CREATE INDEX purchases_listing_idx ON purchase_capability.purchases USING btree (listing_id, created_at DESC);


--
-- Name: purchases_seller_idx; Type: INDEX; Schema: purchase_capability; Owner: -
--

CREATE INDEX purchases_seller_idx ON purchase_capability.purchases USING btree (seller_id, created_at DESC);


--
-- Name: account_referrals_parent_child_idx; Type: INDEX; Schema: referral_capability; Owner: -
--

CREATE INDEX account_referrals_parent_child_idx ON referral_capability.account_referrals USING btree (parent_account_id, child_account_id);


--
-- Name: listing_attributions_active_expiry_idx; Type: INDEX; Schema: referral_capability; Owner: -
--

CREATE INDEX listing_attributions_active_expiry_idx ON referral_capability.listing_attributions USING btree (expires_at) WHERE (state = 'active'::text);


--
-- Name: treasury_entries_created_idx; Type: INDEX; Schema: treasury_capability; Owner: -
--

CREATE INDEX treasury_entries_created_idx ON treasury_capability.entries USING btree (created_at DESC, id DESC);


--
-- Name: treasury_entries_source_idx; Type: INDEX; Schema: treasury_capability; Owner: -
--

CREATE INDEX treasury_entries_source_idx ON treasury_capability.entries USING btree (source_kind, source_id);


--
-- Name: wallet_credit_account_idx; Type: INDEX; Schema: wallet_capability; Owner: -
--

CREATE INDEX wallet_credit_account_idx ON wallet_capability.credits USING btree (account_id, created_at DESC);


--
-- Name: wallet_credit_work_idx; Type: INDEX; Schema: wallet_capability; Owner: -
--

CREATE INDEX wallet_credit_work_idx ON wallet_capability.credits USING btree (state, created_at, id);


--
-- Name: wallet_debit_account_idx; Type: INDEX; Schema: wallet_capability; Owner: -
--

CREATE INDEX wallet_debit_account_idx ON wallet_capability.debits USING btree (account_id, created_at DESC);


--
-- Name: withdrawals_account_idx; Type: INDEX; Schema: withdrawal_capability; Owner: -
--

CREATE INDEX withdrawals_account_idx ON withdrawal_capability.withdrawals USING btree (account_id, created_at DESC);


--
-- Name: withdrawals_state_idx; Type: INDEX; Schema: withdrawal_capability; Owner: -
--

CREATE INDEX withdrawals_state_idx ON withdrawal_capability.withdrawals USING btree (state, created_at);


--
-- Name: entries ledger_entries_append_only; Type: TRIGGER; Schema: ledger_capability; Owner: -
--

CREATE TRIGGER ledger_entries_append_only BEFORE DELETE OR UPDATE ON ledger_capability.entries FOR EACH ROW EXECUTE FUNCTION ledger_capability.prevent_entry_mutation();


--
-- Name: account_referrals account_referrals_child_identity_guard; Type: TRIGGER; Schema: referral_capability; Owner: -
--

CREATE TRIGGER account_referrals_child_identity_guard BEFORE UPDATE OF child_account_id ON referral_capability.account_referrals FOR EACH ROW EXECUTE FUNCTION referral_capability.prevent_account_referral_child_change();


--
-- Name: account_referrals account_referrals_delete_guard; Type: TRIGGER; Schema: referral_capability; Owner: -
--

CREATE TRIGGER account_referrals_delete_guard BEFORE DELETE ON referral_capability.account_referrals FOR EACH ROW EXECUTE FUNCTION referral_capability.prevent_account_referral_delete();


--
-- Name: account_referrals account_referrals_hierarchy_guard; Type: TRIGGER; Schema: referral_capability; Owner: -
--

CREATE TRIGGER account_referrals_hierarchy_guard BEFORE INSERT OR UPDATE OF parent_account_id ON referral_capability.account_referrals FOR EACH ROW EXECUTE FUNCTION referral_capability.enforce_account_referral_hierarchy();


--
-- Name: entries treasury_entries_append_only; Type: TRIGGER; Schema: treasury_capability; Owner: -
--

CREATE TRIGGER treasury_entries_append_only BEFORE DELETE OR UPDATE ON treasury_capability.entries FOR EACH ROW EXECUTE FUNCTION treasury_capability.prevent_entry_mutation();


--
-- Name: credits wallet_credits_append_only; Type: TRIGGER; Schema: wallet_capability; Owner: -
--

CREATE TRIGGER wallet_credits_append_only BEFORE DELETE OR UPDATE ON wallet_capability.credits FOR EACH ROW WHEN ((old.state = 'available'::text)) EXECUTE FUNCTION wallet_capability.prevent_movement_mutation();


--
-- Name: debits wallet_debits_append_only; Type: TRIGGER; Schema: wallet_capability; Owner: -
--

CREATE TRIGGER wallet_debits_append_only BEFORE DELETE OR UPDATE ON wallet_capability.debits FOR EACH ROW EXECUTE FUNCTION wallet_capability.prevent_movement_mutation();


--
-- Name: access_grants access_grants_entitlement_fk; Type: FK CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.access_grants
    ADD CONSTRAINT access_grants_entitlement_fk FOREIGN KEY (entitlement_id) REFERENCES entitlement_capability.entitlements(id);


--
-- Name: integration_listings integration_listings_integration_fk; Type: FK CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.integration_listings
    ADD CONSTRAINT integration_listings_integration_fk FOREIGN KEY (integration_id) REFERENCES access_capability.integrations(id) ON DELETE CASCADE;


--
-- Name: integration_listings integration_listings_listing_fk; Type: FK CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.integration_listings
    ADD CONSTRAINT integration_listings_listing_fk FOREIGN KEY (listing_id) REFERENCES listing_capability.listings(id);


--
-- Name: integrations integrations_owner_fk; Type: FK CONSTRAINT; Schema: access_capability; Owner: -
--

ALTER TABLE ONLY access_capability.integrations
    ADD CONSTRAINT integrations_owner_fk FOREIGN KEY (owner_id) REFERENCES identity_capability.accounts(id);


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES better_auth."user"(id) ON DELETE CASCADE;


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: better_auth; Owner: -
--

ALTER TABLE ONLY better_auth.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES better_auth."user"(id) ON DELETE CASCADE;


--
-- Name: checkouts checkouts_buyer_fk; Type: FK CONSTRAINT; Schema: checkout_capability; Owner: -
--

ALTER TABLE ONLY checkout_capability.checkouts
    ADD CONSTRAINT checkouts_buyer_fk FOREIGN KEY (buyer_id) REFERENCES identity_capability.accounts(id);


--
-- Name: checkouts checkouts_listing_fk; Type: FK CONSTRAINT; Schema: checkout_capability; Owner: -
--

ALTER TABLE ONLY checkout_capability.checkouts
    ADD CONSTRAINT checkouts_listing_fk FOREIGN KEY (listing_id) REFERENCES listing_capability.listings(id);


--
-- Name: checkouts checkouts_purchase_fk; Type: FK CONSTRAINT; Schema: checkout_capability; Owner: -
--

ALTER TABLE ONLY checkout_capability.checkouts
    ADD CONSTRAINT checkouts_purchase_fk FOREIGN KEY (purchase_id) REFERENCES purchase_capability.purchases(id);


--
-- Name: entitlements entitlements_buyer_fk; Type: FK CONSTRAINT; Schema: entitlement_capability; Owner: -
--

ALTER TABLE ONLY entitlement_capability.entitlements
    ADD CONSTRAINT entitlements_buyer_fk FOREIGN KEY (buyer_id) REFERENCES identity_capability.accounts(id);


--
-- Name: entitlements entitlements_listing_fk; Type: FK CONSTRAINT; Schema: entitlement_capability; Owner: -
--

ALTER TABLE ONLY entitlement_capability.entitlements
    ADD CONSTRAINT entitlements_listing_fk FOREIGN KEY (listing_id) REFERENCES listing_capability.listings(id);


--
-- Name: entitlements entitlements_purchase_fk; Type: FK CONSTRAINT; Schema: entitlement_capability; Owner: -
--

ALTER TABLE ONLY entitlement_capability.entitlements
    ADD CONSTRAINT entitlements_purchase_fk FOREIGN KEY (purchase_id) REFERENCES purchase_capability.purchases(id);


--
-- Name: funding_transactions funding_transactions_account_fk; Type: FK CONSTRAINT; Schema: funding_capability; Owner: -
--

ALTER TABLE ONLY funding_capability.funding_transactions
    ADD CONSTRAINT funding_transactions_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: account_capabilities account_capabilities_account_fk; Type: FK CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.account_capabilities
    ADD CONSTRAINT account_capabilities_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: api_keys api_keys_account_fk; Type: FK CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.api_keys
    ADD CONSTRAINT api_keys_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_created_by_fk; Type: FK CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.api_keys
    ADD CONSTRAINT api_keys_created_by_fk FOREIGN KEY (created_by) REFERENCES identity_capability.accounts(id);


--
-- Name: auth_account_links auth_account_links_account_fk; Type: FK CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.auth_account_links
    ADD CONSTRAINT auth_account_links_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id) ON DELETE CASCADE;


--
-- Name: auth_account_links auth_account_links_auth_user_fk; Type: FK CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.auth_account_links
    ADD CONSTRAINT auth_account_links_auth_user_fk FOREIGN KEY (auth_user_id) REFERENCES better_auth."user"(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_account_fk; Type: FK CONSTRAINT; Schema: identity_capability; Owner: -
--

ALTER TABLE ONLY identity_capability.sessions
    ADD CONSTRAINT sessions_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: audit_records audit_records_actor_fk; Type: FK CONSTRAINT; Schema: kernel; Owner: -
--

ALTER TABLE ONLY kernel.audit_records
    ADD CONSTRAINT audit_records_actor_fk FOREIGN KEY (actor_id) REFERENCES identity_capability.accounts(id);


--
-- Name: entry_settlements entry_settlements_entry_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entry_settlements
    ADD CONSTRAINT entry_settlements_entry_fk FOREIGN KEY (original_entry_id) REFERENCES ledger_capability.entries(id);


--
-- Name: entries ledger_entries_account_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entries
    ADD CONSTRAINT ledger_entries_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: entries ledger_entries_distribution_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entries
    ADD CONSTRAINT ledger_entries_distribution_fk FOREIGN KEY (distribution_id) REFERENCES ledger_capability.purchase_distributions(id);


--
-- Name: entries ledger_entries_original_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entries
    ADD CONSTRAINT ledger_entries_original_fk FOREIGN KEY (original_entry_id) REFERENCES ledger_capability.entries(id);


--
-- Name: entries ledger_entries_purchase_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entries
    ADD CONSTRAINT ledger_entries_purchase_fk FOREIGN KEY (purchase_id) REFERENCES purchase_capability.purchases(id);


--
-- Name: entries ledger_entries_reversal_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.entries
    ADD CONSTRAINT ledger_entries_reversal_fk FOREIGN KEY (reversal_id) REFERENCES ledger_capability.reversals(id);


--
-- Name: purchase_distributions purchase_distributions_purchase_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.purchase_distributions
    ADD CONSTRAINT purchase_distributions_purchase_fk FOREIGN KEY (purchase_id) REFERENCES purchase_capability.purchases(id);


--
-- Name: reversals reversals_distribution_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.reversals
    ADD CONSTRAINT reversals_distribution_fk FOREIGN KEY (distribution_id) REFERENCES ledger_capability.purchase_distributions(id);


--
-- Name: reversals reversals_purchase_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.reversals
    ADD CONSTRAINT reversals_purchase_fk FOREIGN KEY (purchase_id) REFERENCES purchase_capability.purchases(id);


--
-- Name: withdrawal_reservation_events withdrawal_reservation_events_account_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservation_events
    ADD CONSTRAINT withdrawal_reservation_events_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: withdrawal_reservation_events withdrawal_reservation_events_reservation_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservation_events
    ADD CONSTRAINT withdrawal_reservation_events_reservation_fk FOREIGN KEY (reservation_id) REFERENCES ledger_capability.withdrawal_reservations(id);


--
-- Name: withdrawal_reservation_events withdrawal_reservation_events_withdrawal_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservation_events
    ADD CONSTRAINT withdrawal_reservation_events_withdrawal_fk FOREIGN KEY (withdrawal_id) REFERENCES withdrawal_capability.withdrawals(id);


--
-- Name: withdrawal_reservations withdrawal_reservations_account_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservations
    ADD CONSTRAINT withdrawal_reservations_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: withdrawal_reservations withdrawal_reservations_withdrawal_fk; Type: FK CONSTRAINT; Schema: ledger_capability; Owner: -
--

ALTER TABLE ONLY ledger_capability.withdrawal_reservations
    ADD CONSTRAINT withdrawal_reservations_withdrawal_fk FOREIGN KEY (withdrawal_id) REFERENCES withdrawal_capability.withdrawals(id);


--
-- Name: media listing_media_listing_fk; Type: FK CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.media
    ADD CONSTRAINT listing_media_listing_fk FOREIGN KEY (listing_id) REFERENCES listing_capability.listings(id);


--
-- Name: reviews listing_reviews_account_fk; Type: FK CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.reviews
    ADD CONSTRAINT listing_reviews_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: reviews listing_reviews_listing_fk; Type: FK CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.reviews
    ADD CONSTRAINT listing_reviews_listing_fk FOREIGN KEY (listing_id) REFERENCES listing_capability.listings(id);


--
-- Name: reviews listing_reviews_moderator_fk; Type: FK CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.reviews
    ADD CONSTRAINT listing_reviews_moderator_fk FOREIGN KEY (moderated_by) REFERENCES identity_capability.accounts(id);


--
-- Name: listings listings_seller_fk; Type: FK CONSTRAINT; Schema: listing_capability; Owner: -
--

ALTER TABLE ONLY listing_capability.listings
    ADD CONSTRAINT listings_seller_fk FOREIGN KEY (seller_id) REFERENCES identity_capability.accounts(id);


--
-- Name: payments payments_buyer_fk; Type: FK CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.payments
    ADD CONSTRAINT payments_buyer_fk FOREIGN KEY (buyer_id) REFERENCES identity_capability.accounts(id);


--
-- Name: payments payments_listing_fk; Type: FK CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.payments
    ADD CONSTRAINT payments_listing_fk FOREIGN KEY (listing_id) REFERENCES listing_capability.listings(id);


--
-- Name: provider_operations provider_operations_funding_fk; Type: FK CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.provider_operations
    ADD CONSTRAINT provider_operations_funding_fk FOREIGN KEY (funding_id) REFERENCES funding_capability.funding_transactions(id);


--
-- Name: provider_operations provider_operations_payment_fk; Type: FK CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.provider_operations
    ADD CONSTRAINT provider_operations_payment_fk FOREIGN KEY (payment_id) REFERENCES payment_capability.payments(id);


--
-- Name: reconciliation_attempts reconciliation_attempts_actor_fk; Type: FK CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.reconciliation_attempts
    ADD CONSTRAINT reconciliation_attempts_actor_fk FOREIGN KEY (actor_id) REFERENCES identity_capability.accounts(id);


--
-- Name: reconciliation_attempts reconciliation_attempts_payment_fk; Type: FK CONSTRAINT; Schema: payment_capability; Owner: -
--

ALTER TABLE ONLY payment_capability.reconciliation_attempts
    ADD CONSTRAINT reconciliation_attempts_payment_fk FOREIGN KEY (payment_id) REFERENCES payment_capability.payments(id);


--
-- Name: attempts payout_attempts_execution_fk; Type: FK CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.attempts
    ADD CONSTRAINT payout_attempts_execution_fk FOREIGN KEY (execution_id) REFERENCES payout_capability.executions(id);


--
-- Name: attempts payout_attempts_withdrawal_fk; Type: FK CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.attempts
    ADD CONSTRAINT payout_attempts_withdrawal_fk FOREIGN KEY (withdrawal_id) REFERENCES withdrawal_capability.withdrawals(id);


--
-- Name: executions payout_executions_withdrawal_fk; Type: FK CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.executions
    ADD CONSTRAINT payout_executions_withdrawal_fk FOREIGN KEY (withdrawal_id) REFERENCES withdrawal_capability.withdrawals(id);


--
-- Name: paystack_recipients paystack_recipients_account_fk; Type: FK CONSTRAINT; Schema: payout_capability; Owner: -
--

ALTER TABLE ONLY payout_capability.paystack_recipients
    ADD CONSTRAINT paystack_recipients_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: purchases purchases_buyer_fk; Type: FK CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_buyer_fk FOREIGN KEY (buyer_id) REFERENCES identity_capability.accounts(id);


--
-- Name: purchases purchases_checkout_fk; Type: FK CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_checkout_fk FOREIGN KEY (checkout_id) REFERENCES checkout_capability.checkouts(id);


--
-- Name: purchases purchases_listing_fk; Type: FK CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_listing_fk FOREIGN KEY (listing_id) REFERENCES listing_capability.listings(id);


--
-- Name: purchases purchases_payment_fk; Type: FK CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_payment_fk FOREIGN KEY (payment_id) REFERENCES payment_capability.payments(id);


--
-- Name: purchases purchases_referral_attribution_fk; Type: FK CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_referral_attribution_fk FOREIGN KEY (referral_attribution_id) REFERENCES referral_capability.listing_attributions(id);


--
-- Name: purchases purchases_referral_referrer_fk; Type: FK CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_referral_referrer_fk FOREIGN KEY (referral_referrer_account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: purchases purchases_seller_fk; Type: FK CONSTRAINT; Schema: purchase_capability; Owner: -
--

ALTER TABLE ONLY purchase_capability.purchases
    ADD CONSTRAINT purchases_seller_fk FOREIGN KEY (seller_id) REFERENCES identity_capability.accounts(id);


--
-- Name: account_referrals account_referrals_child_fk; Type: FK CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.account_referrals
    ADD CONSTRAINT account_referrals_child_fk FOREIGN KEY (child_account_id) REFERENCES identity_capability.accounts(id) ON DELETE RESTRICT;


--
-- Name: account_referrals account_referrals_parent_fk; Type: FK CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.account_referrals
    ADD CONSTRAINT account_referrals_parent_fk FOREIGN KEY (parent_account_id) REFERENCES identity_capability.accounts(id) ON DELETE RESTRICT;


--
-- Name: listing_attributions listing_attributions_listing_fk; Type: FK CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.listing_attributions
    ADD CONSTRAINT listing_attributions_listing_fk FOREIGN KEY (listing_id) REFERENCES listing_capability.listings(id);


--
-- Name: listing_attributions listing_attributions_referrer_fk; Type: FK CONSTRAINT; Schema: referral_capability; Owner: -
--

ALTER TABLE ONLY referral_capability.listing_attributions
    ADD CONSTRAINT listing_attributions_referrer_fk FOREIGN KEY (referrer_account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: entries treasury_entries_actor_fk; Type: FK CONSTRAINT; Schema: treasury_capability; Owner: -
--

ALTER TABLE ONLY treasury_capability.entries
    ADD CONSTRAINT treasury_entries_actor_fk FOREIGN KEY (actor_id) REFERENCES identity_capability.accounts(id);


--
-- Name: credits wallet_credits_account_fk; Type: FK CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.credits
    ADD CONSTRAINT wallet_credits_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: credits wallet_credits_funding_fk; Type: FK CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.credits
    ADD CONSTRAINT wallet_credits_funding_fk FOREIGN KEY (funding_id) REFERENCES funding_capability.funding_transactions(id);


--
-- Name: debits wallet_debits_account_fk; Type: FK CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.debits
    ADD CONSTRAINT wallet_debits_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: debits wallet_debits_checkout_fk; Type: FK CONSTRAINT; Schema: wallet_capability; Owner: -
--

ALTER TABLE ONLY wallet_capability.debits
    ADD CONSTRAINT wallet_debits_checkout_fk FOREIGN KEY (checkout_id) REFERENCES checkout_capability.checkouts(id);


--
-- Name: withdrawals withdrawals_account_fk; Type: FK CONSTRAINT; Schema: withdrawal_capability; Owner: -
--

ALTER TABLE ONLY withdrawal_capability.withdrawals
    ADD CONSTRAINT withdrawals_account_fk FOREIGN KEY (account_id) REFERENCES identity_capability.accounts(id);


--
-- Name: account_profiles; Type: VIEW; Schema: identity_capability; Owner: -
--

CREATE VIEW identity_capability.account_profiles AS
 SELECT a.id,
    a.uuid,
    a.username,
    a.metadata,
    a.created_at,
    a.updated_at,
    u.email,
    NULLIF(btrim(u.display_name), ''::text) AS display_name,
    u.image
   FROM ((identity_capability.accounts a
     LEFT JOIN identity_capability.auth_account_links l ON ((l.account_id = a.id)))
     LEFT JOIN better_auth."user" u ON ((u.id = l.auth_user_id)));


--
-- Bootstrap singleton policies that the historical migration chain inserted.
-- These are schema-owned defaults required by the application on a fresh
-- development database; mutable policy values are changed by their normal
-- configuration/application paths after initialization.
INSERT INTO ledger_capability.distribution_policy (singleton, platform_account_uuid)
VALUES (true, '00000000-0000-4000-8000-000000000001');

INSERT INTO referral_capability.commission_policy (singleton, rates_basis_points)
VALUES (true, '{}');

INSERT INTO withdrawal_capability.policy (singleton)
VALUES (true);

-- End of canonical PostgreSQL baseline.
