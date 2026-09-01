# Account settings

Cliqero settings keep authentication infrastructure separate from business
identity. Better Auth owns sessions and provider credentials; the Cliqero
account owns the handle, country, profile, integrations, roles, and economic
identity.

## Profile and account

The profile panel reads `/api/me/profile` and can update the account handle and
country. Handles are normalized to lowercase and remain unique. Email is shown
as authentication context and is read-only here; changing it requires a
Better Auth-supported flow so the auth mapping cannot drift from the Cliqero
account.

## Integrations

The existing integration capability is a legacy listing-access verification
credential. It is tied to a listing owner by the backend and is used by
downstream access verification; it is not a normal-user catalogue or seller
capability. Accordingly, it is intentionally not exposed in the ordinary-user
Settings navigation. Operator/catalogue-manager workflows retain the existing
owner-scoped API and hashed, one-time credential behavior.

User-facing payout destination management is still deferred because the
current withdrawal model accepts provider-neutral manual destination
references rather than a safe saved-destination resource.

## API keys

`/api/api-keys` is the personal API-key surface. Keys are high-entropy opaque
credentials whose hashes are persisted; the raw secret is returned only by
the create response. The settings UI keeps that secret in transient React
state, offers an explicit copy action, and clears it when dismissed. It is
never put in a URL, browser storage, or subsequent API response.

Scopes are selected from the canonical registry and only restrict what the
owning account may do. They cannot grant an operator role, change ownership,
or bypass domain authorization. Browser sessions may manage their own keys;
API-key callers additionally need `api_keys:manage`. Operator-wide key
management remains under the separate `/api/operator/api-keys` capability.

Key metadata includes prefix, scopes, creation/use/expiry timestamps, and
revocation state. Revocation is durable and owner-scoped; expiry is enforced
by the principal resolver.
