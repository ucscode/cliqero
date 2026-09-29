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

The main document is grouped by Cliqero domains, including Accounts and
Payments. Provider ingress is excluded from the main Core/System document;
protocol handlers are not added to the published automation contract. Do not
add vendor tags or vendor-named operator routes for ordinary payment
administration. Compatibility endpoints should be classified before they are
added to the published contract.

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
