-- Better Auth owns authentication records in a separate schema.  Business
-- capabilities continue to reference identity_capability.accounts only.
create schema if not exists better_auth;

create table if not exists better_auth."user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists better_auth."session" (
  id text primary key,
  "userId" text not null references better_auth."user"(id) on delete cascade,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists better_auth_session_user_idx on better_auth."session" ("userId");

create table if not exists better_auth.account (
  id text primary key,
  "userId" text not null references better_auth."user"(id) on delete cascade,
  "accountId" text not null,
  "providerId" text not null,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  issuer text not null,
  constraint better_auth_account_provider_identity_unique unique ("providerId", "accountId")
);
create index if not exists better_auth_account_user_idx on better_auth.account ("userId");

create table if not exists better_auth.verification (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists better_auth_verification_identifier_idx on better_auth.verification (identifier);

-- This is the only bridge from authentication infrastructure to the
-- Cliqero business identity.  A null account_id represents a social-login
-- user who still needs Cliqero-specific onboarding (handle/country).
create table if not exists identity_capability.auth_account_links (
  auth_user_id text primary key references better_auth."user"(id) on delete cascade,
  account_id uuid unique references identity_capability.accounts(id) on delete cascade,
  onboarding_state text not null default 'incomplete',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_account_links_onboarding_state_valid check (onboarding_state in ('incomplete','complete')),
  constraint auth_account_links_complete_account check ((onboarding_state = 'complete' and account_id is not null) or onboarding_state = 'incomplete')
);
create index if not exists auth_account_links_account_idx on identity_capability.auth_account_links (account_id);
