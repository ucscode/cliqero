# Cliqero API surface

Cliqero exposes HTTP endpoints for three different purposes. Their classification
is based on the contract owner, not the framework route directory.

## Core/System API

Stable Cliqero domain capabilities intended for first-party services and
authorized automation: accounts, catalogue, blog, reviews, payments, purchases,
wallet/funding, withdrawals, referrals/hierarchy, treasury, and capabilities.
Use domain resource names and Cliqero-owned states. A provider is data on a
payment, never the general payment resource namespace. The main
`/api/openapi.json` and `/docs` are the contract surface for these APIs.

## Application/UI API

Screen-oriented projections, browser-session workflows, and retained
compatibility endpoints exist to support the Cliqero web application. They may
remain HTTP routes, but are not automatically stable automation contracts.
Framework/UI conveniences should be documented and scoped separately when they
are not suitable for API-key clients.

## Provider/Ingress API

Replaceable providers call protocol-defined endpoints such as
`/api/webhooks/paystack` and `/api/payments/nowpayments/ipn`. Browser return
routes such as `/payments/paystack/callback` are also provider-specific
application ingress. Provider-specific authentication/signature rules belong
at these boundaries. Operator and automation workflows use provider-neutral
Cliqero payment endpoints instead.

## Operator payment operations

The stable operator payment resource is `/api/operator/payments`, with detail,
event inspection, and reconciliation subresources. Reconciliation reads the
payment's recorded provider and delegates verification through the registered
payment provider abstraction. The optional `provider` query filters a domain
collection; it does not select a provider-specific route. Operator reads
require `finance.read` and the `payments:read` API-key scope; mutations require
`finance.manage` and the `payments:manage` scope.

The former `/api/operator/paystack/events` and
`/api/operator/paystack/reconcile` routes are removed. Provider callbacks remain
provider-named because those routes implement external provider protocols.

## OpenAPI organization

`/api/openapi.json` is the single generated specification and `/docs` renders
that exact document. Operations use flat, context-aware tags such as `Accounts
(System)` and `Accounts (Operator)`; a context appears only when routes for it
exist. Every documented operation has a meaningful tag, action-oriented summary,
and description. Provider ingress retains provider-specific wire-protocol names
and is identified separately from System and Operator domain APIs. Do not add
vendor-named operator routes for ordinary payment administration.

## Resource routes and state changes

Stable APIs do not expose Operator table bulk-selection endpoints. Bulk actions
in the UI repeat canonical single-resource operations and report per-item
failures. Ordinary lifecycle/status changes use `PATCH` on the resource with a
validated state/status field; dedicated action routes are reserved for genuine
commands with distinct side effects, such as rotating a credential.

Listing-associated integration credentials are nested under their owning
listing: System routes use `/api/listings/{listingId}/integrations/...`, while
Operator routes use `/api/operator/listings/{listingId}/integrations/...`.
System routes verify listing ownership, and the listing ID is not repeated in
the create body.

Deleting an account removes its parent edge and detaches its immediate children
by deleting their edges to the account. Those children become roots; their own
descendants remain connected. The graph is not compressed or reparented. Future
commission shares for configured referral levels absent from the live graph go
to the platform rather than a substitute upline.

## Compatibility route classification

Compatibility handlers remain adapters, not a second application layer. The
registered `/api/compat` routes are classified as follows:

- **Core/System candidates:** accounts, listings and listing lifecycle/media,
  purchases, wallet and funding, earnings, withdrawals and destinations,
  referrals, integrations, operator accounts/capabilities, catalogue,
  treasury, settlement, purchase reversal, and operator finance/funding. Their
  contracts use Cliqero-owned records and policies even while older clients use
  the compatibility path.
- **Core/System checkout:** `/api/checkout` creation and
  `/api/checkout/{id}/pay` are purchase/wallet domain operations; they do not
  select or call an external payment provider.
- **Application/UI or protocol support:** `/api/me/onboarding`,
  `/api/funding/development/verify`, health, password reset, and integration credential
  verification. These exist for browser/bootstrap, local development, or
  authentication protocol workflows and are not provider payment APIs.
- **Provider/Ingress:** the Next.js Paystack webhook and browser-return route,
  plus the NOWPayments IPN route. They are outside `legacyRoutes` and the main
  Core/System OpenAPI document because they implement provider wire protocols.

The previously registered Paystack operator events/reconciliation compatibility
handlers are obsolete and removed. Payment operations now live at
`/api/operator/payments` and resolve provider protocol through the payment
registry.
