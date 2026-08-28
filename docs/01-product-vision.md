# Product Vision

[Back to documentation index](./README.md)

## What Cliqero is

Cliqero is a productless commerce and referral platform.

A seller lists something people can pay to access. Another user may refer that listing and earn from a successful purchase. A buyer pays through Cliqero and gains access to the listing's configured destination.

The core flow is deliberately small:

> List -> Refer -> Buy -> Access

Cliqero does not need to understand what the destination contains. It may lead to an ebook download, software, a SaaS application, a private page, an offer, a course, a repository, a download gateway, a custom service, or something not yet invented.

## The productless principle

Cliqero must not create separate domain models for ebook, software, course, template, API, download, service, or similar product types merely because those things can be sold.

The platform models three stable primitives:

1. **Listing** — metadata describing something that can be purchased.
2. **Entitlement** — evidence that an account has the right to access a purchased listing.
3. **Destination** — the external or internal location through which that entitlement is used.

The thing behind the destination belongs to the seller or destination system, not to Cliqero's core domain.

Product-specific information should be added only when real user requirements prove that additional structured data is needed. Peripheral information should prefer metadata/extensible structures over speculative schema.

## What Cliqero owns

Cliqero owns the commerce and access relationship:

- account identity;
- listings and listing metadata;
- public discovery/presentation;
- referral attribution;
- checkout and payment verification;
- purchase records;
- entitlements;
- access handoff;
- referral commission calculation;
- ledger/wallet accounting;
- withdrawals;
- audit and administration.

Cliqero does not need to host or implement the thing being sold.

## Access handoff

After a purchase is authorized, the buyer can open the listing destination through Cliqero.

Where useful, Cliqero appends a `source` value to the destination URL:

`https://destination.example/access?source=<token>`

The `source` value must not be a forgeable user ID, email address, raw purchase ID, or other trust-by-query-string mechanism. It is a cryptographically random opaque bearer credential/reference containing no business data. Cliqero resolves it server-side to the relevant access grant and authorization context.

An integrated destination may validate that token through a Cliqero access-verification API before granting its own service.

This makes Cliqero responsible for answering the stable question:

> Is this access request currently entitled to this listing?

The destination remains responsible for deciding what authorized access means.

## Why this model exists

The platform should not keep changing architecture because a different kind of sellable thing is discovered.

A seller should be able to create something elsewhere, add its metadata and destination to Cliqero, set a price, and sell access without Cliqero learning a new product category.

The architecture evolves from observed requirements, not imagined product taxonomies.

## Referral model

A user can share an attributed listing link. If an attributed buyer completes a valid purchase, the applicable referral commission can be credited according to platform policy.

Referral rewards originate from real sales activity. Registration alone does not create earnings.

## What Cliqero is not

Cliqero is not inherently:

- an ebook host;
- a software distribution server;
- a course platform;
- a file-storage service;
- a streaming platform;
- a license manager;
- a SaaS provisioning system;
- an inventory-management system;
- a recruitment-fee scheme.

Those capabilities may integrate with Cliqero when needed, but none defines the core product.

## Product philosophy

### 1. Model access, not product categories

A listing sells entitlement to a destination. Do not branch the architecture by product type without a proven requirement.

### 2. Keep the base object small

Stable invariant data remains explicit. Optional and evolving listing data belongs in metadata where appropriate.

### 3. Let destinations specialize

A private download gateway, SaaS app, API, course system, or custom service can interpret Cliqero authorization in its own way.

### 4. Referrals follow successful commerce

Referral earnings are consequences of valid purchases, not page views, clicks, or account recruitment.

### 5. Reduce scope, never integrity

Cliqero handles real money and access rights. The first release can be narrow, but payment, ledger, entitlement, attribution, authorization, and audit behavior must be production-grade.

## Long-term opportunity

The strength of the model is that new sellable experiences do not require a new commerce architecture.

If a future requirement cannot be represented by listing metadata, entitlement, and destination, Cliqero may introduce a new capability. Until then, it should not speculate.
