# Authentication boundary

Better Auth is the authentication mechanism inside the existing web
application. It owns email/password credentials, browser sessions, OAuth state,
Google sign-in, email verification and password-reset tokens. No separate auth
service or container is introduced.

Cliqero owns the business identity. `identity_capability.accounts.id` remains
the ID referenced by wallets, referrals, purchases, entitlements, earnings,
withdrawals and operator capabilities. The `better_auth` schema stores Better
Auth's users, sessions and provider accounts. The
`identity_capability.auth_account_links` table maps one Better Auth user to at
most one Cliqero account. Business code receives an `Account`, never a Better
Auth user or a Google profile.

## Account lifecycle

Email/password registration creates both the Better Auth user and the Cliqero
account, then marks the mapping complete. The two adapters are compensated if
account creation fails. Existing pre-Better-Auth scrypt credentials are not
silently imported; development/pre-production accounts must register again or
use an explicit password reset. This avoids keeping two password verifiers.

Google is enabled when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
Better Auth's account-linking policy trusts Google only when its verified
identity can be safely linked; a local password identity must have a verified
email before implicit linking. A Google-first user is authenticated but has an
incomplete Cliqero mapping until `POST /api/me/onboarding` supplies a unique
handle and country. Business endpoints requiring an account reject that state.

## Transport and configuration

The canonical browser endpoints are Better Auth's `/api/auth/*` routes,
including sign-up, sign-in, sign-out, OAuth callbacks, verification and reset
password. Sessions use Better Auth's HTTP-only `better-auth.session_token`
cookie with SameSite protection and secure cookies in HTTPS production. The
The former `/api/auth/sessions` compatibility facade is retired; clients use
Better Auth's canonical protocol endpoints directly rather than maintaining a
second login implementation.

Required production settings are:

```text
BETTER_AUTH_SECRET=<random value of at least 32 characters>
BETTER_AUTH_URL=https://app.example
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
```

The mail-delivery callbacks are intentionally provider-neutral no-ops in local
development. A production mail provider can be attached to Better Auth's
`sendVerificationEmail` and `sendResetPassword` hooks without changing any
Cliqero business capability. Future 2FA/passkey plugins can be added at this
same boundary.

Authorization remains Cliqero-owned: authentication establishes a principal,
then operator/catalogue-manager capabilities are evaluated from the account's
domain records. Public listing reads remain anonymous; authenticated state can
be resolved server-side without exposing authentication-provider objects.

## Headless API keys

Hono routes also accept `Authorization: Bearer cliq_live_...` API keys. The
`identity_capability.api_keys` table stores only a SHA-256 secret hash and
lookup prefix; the plaintext secret is returned once at operator creation.
Revocation, expiry, and `last_used_at` are durable. API-key requests resolve to
the same Cliqero account and roles as browser sessions, while key scopes add a
restriction and can never elevate the account. Invalid explicit credentials do
not fall back to another credential. The generated Hono/OpenAPI contract is
available at `/api/openapi.json`.
