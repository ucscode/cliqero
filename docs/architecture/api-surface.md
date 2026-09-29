# Cliqero API surface

Cliqero exposes one domain-oriented API. Authorization mode is independent of
resource naming. Public visitors, authenticated users, privileged operators, and
API keys use the same canonical resources subject to operation-specific
authorization policy.

The Operator dashboard is a privileged first-party client of the canonical
Cliqero API. It does not have its own API namespace. `/api/operator/*` is not a
registered API route family.

## Request authorization

Each API request follows one boundary:

```text
request -> resolve principal -> authorize operation -> application/domain service -> response
```

The principal is one of:

- `anonymous`;
- `user_session`, with account identity and capabilities;
- `api_key`, with account identity, capabilities, and granted scopes.

Hono middleware resolves the principal once and stores it in request context.
Compatibility adapters reuse that same identity; direct adapter invocations
resolve it once at their boundary. The authorizer also considers whether an
Authorization header was supplied: the principal model currently represents an
invalid bearer credential as `anonymous`, so that signal distinguishes invalid
credentials (401) from an unauthenticated request to a public route.

For API-key operations that carry both a capability and scope requirement, both
must match. A scope never grants a capability the owning account does not have.
Session requests are checked against the required capability. Public routes may
allow anonymous access; selected browser-only operations explicitly reject API
keys.

OpenAPI exposes operation authorization through metadata such as
`x-authentication-mode`, `x-session-capability`, `x-required-api-scope`, and
`x-public-access`.

## Canonical resource families

Use resource-oriented routes, for example:

- Accounts and keys: `/api/accounts`, `/api/accounts/{accountId}/capabilities`,
  `/api/accounts/{accountId}/api-keys`.
- Blog: `/api/blog/posts`, `/api/blog/categories`, and session-only
  `/api/blog/previews`.
- Listings: `/api/listings`, `/api/catalogue/categories`, and
  `/api/listings/{listingId}/integrations`.
- Reviews: `/api/reviews` and `/api/reviews/{reviewId}`.
- Payments: `/api/payments`, `/api/payments/events`, and reconciliation
  resources. These remain provider-neutral.
- Funding, wallet, earnings, distributions, withdrawals, treasury, hierarchy,
  and referrals remain under their respective domain paths.

The same resource can provide public defaults and privileged filtered views.
For example, blog post reads default to published content; `draft`/`all` status
filters require content-management authority. Listing reads default to public
catalogue visibility; internal states require catalogue-management authority.
Privileged filters are authorized before the broader view is returned.

Customer-owned resources remain ownership-scoped when privileged reads are
available on the same path. Removing a route prefix does not make records
public.

## OpenAPI and provider ingress

`/api/openapi.json` is the single generated specification and `/docs` renders
that exact document. Tags describe resources (`Accounts`, `Listings`, `Blog`,
`Reviews`, `Payments`, `Funding`, `Withdrawals`, `Hierarchy`, `Referrals`, and
`Treasury`), not caller classes. Every operation has a tag, summary, and
description.

Provider protocol ingress remains provider-named because it implements an
external protocol, for example `/api/webhooks/paystack`,
`/api/payments/nowpayments/ipn`, and the Paystack browser return route
`/payments/paystack/callback`. Provider-specific signature and wire-format rules
belong at those boundaries; customer/operator payment operations use
provider-neutral resources.

## UI-only workflows and state changes

Bulk selection is a dashboard workflow, not a public API resource. The browser
submits one server action; the server invokes the canonical application service
for each selected record and returns per-item outcomes. No `/api/**/bulk` route
is exposed in OpenAPI.

Ordinary lifecycle/status changes use `PATCH` on the resource with a validated
state/status field. Dedicated action routes are reserved for genuine commands
with distinct side effects, such as rotating an integration credential.

Listing integration credentials are nested under their listing at
`/api/listings/{listingId}/integrations/...`. The handler authorizes either the
listing owner or a catalogue manager; API-key managers must satisfy both the
account capability and `catalogue:manage` scope. The listing ID is not repeated
in the create body.

## Preserved domain invariants

Deleting an account removes its parent edge and detaches its immediate children
by deleting their edges to the account. Those children become roots; their own
descendants remain connected. The graph is not compressed or reparented. Future
commission shares for configured referral levels absent from the live graph go
to the platform rather than a substitute upline.
