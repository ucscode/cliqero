# Account settings

Customer Settings contains one Profile surface.

## Profile

The username is displayed as a disabled field in normal Settings. Country is
ordinary self-service profile information and can be selected or cleared from
the country dropdown. Saving profile details updates country only; controlled
application workflows may manage username changes separately.

Email is editable directly in the Profile form. Save profile requests an email
change through Better Auth only when the trimmed address differs from the
current canonical email. The feedback is intentionally neutral about whether
the address can be used. The current email remains canonical until the new
address is verified.

## Integrations

The existing integration capability is a listing-access verification
credential. It is tied to a listing owner by the backend and is used by
downstream access verification; it is not a normal-user catalogue or seller
capability. Accordingly, it is intentionally not exposed in the ordinary-user
Settings navigation. Operator catalogue workflows retain the existing
owner-scoped API and hashed, one-time credential behavior.

User-facing payout destination management is still deferred because the
withdrawal model accepts provider-neutral manual destination references rather
than a safe saved-destination resource.

## API keys

API keys are not an ordinary customer Settings feature. Operators may provision
and manage keys for a selected account through the account-scoped operator API
at `/api/operator/accounts/{accountId}/api-keys`. Key secrets are shown only at
creation; persistence, bearer authentication, scope enforcement, and revocation
remain part of the platform's controlled integration functionality.
