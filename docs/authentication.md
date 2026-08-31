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
legacy `/api/auth/sessions` endpoint remains a compatibility facade and returns
the Better Auth bearer token for existing API clients; it forwards the Better
Auth cookie policy rather than creating a second session format.

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
