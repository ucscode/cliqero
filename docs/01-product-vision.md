# Product Vision

[Back to documentation index](./README.md)

## What Cliqero is

Cliqero is a catalogue-led commerce platform for purchasing access to products and services fulfilled through configured destinations.

The platform owns and curates the commercial catalogue. Ordinary accounts are customers and, where eligible, promoters. They do not become sellers merely by registering. Catalogue creation and publication require operator authority or the dedicated `catalogue_manager` capability.

The primary commerce flow is:

> Catalogue → Buy → Entitlement → Access

Referral distribution exists around that commerce flow but does not define the storefront or customer proposition.

## Productless commerce

Cliqero does not need a separate core domain model for ebook, software, course, template, API, download, service, or every future product category. A listing describes what is being offered; a purchase records the commercial fact; an entitlement records the buyer's right; and a destination defines where authorized access is handed off.

The stable primitives are:

1. **Listing** — platform-managed metadata describing something purchasable.
2. **Purchase** — immutable commercial fact and purchase terms.
3. **Entitlement** — the account's access right.
4. **Destination** — the location through which authorized access is fulfilled.

Product-specific information is introduced only when a real requirement establishes a new invariant. Otherwise metadata and provider-neutral integrations keep the catalogue extensible.

## Catalogue ownership

Commercial listings are platform inventory, not user storefronts.

Operators and catalogue managers can create, edit, import, publish, archive, restore, and manage listing media. A creator/manager identifier may exist for audit, but it does not make that account the seller or payee. Historical seller fields are compatibility/audit data only for new wallet commerce.

This distinction also controls economics: completed commerce may produce referral earnings and platform allocation, but there is no normal seller-credit branch for ordinary user-created inventory.

## Buyer experience

The public product should primarily present useful listings and the value buyers receive. Internal accounting mechanics, funding providers, referral commissions, hierarchy, and treasury are supporting capabilities rather than the public identity of the business.

A visitor can discover catalogue listings without authentication. Account-specific actions such as purchase/access require identity. An authenticated account may also promote eligible listings, but promotion belongs in a dedicated opportunity/referral experience rather than dominating general commerce messaging.

## Access handoff

After a valid purchase, the buyer opens access through Cliqero. The platform verifies purchase ownership and active entitlement before resolving the configured destination.

Where useful, the destination receives a `source` credential. It is cryptographically random, opaque, and resolved server-side. It is not a JWT/JWE and contains no buyer, listing, purchase, entitlement, price, or other business claims.

An integrated destination can verify the credential through an authenticated access API. Cliqero remains authoritative for whether the entitlement is currently usable; the destination remains responsible for its specialized fulfillment.

## Referral model

Authenticated accounts may share attributed links for eligible listings. A qualifying completed purchase can create referral earnings according to the configured policy.

Referral rewards are consequences of real commerce. Registration, page views, clicks, and recruitment alone do not create earnings. Referral messaging should therefore live in dedicated promotion/opportunity surfaces instead of being mixed into every customer-facing catalogue message.

## Accounting boundary

External payment providers fund internal buyer value; they do not directly purchase listings. Buyer funds, referral earnings, and company treasury are distinct accounting domains. Balances are projections over append-only facts rather than mutable authoritative fields.

## What Cliqero is not

Cliqero is not inherently a multi-seller marketplace, recruitment-fee scheme, payment wallet product, ebook host, course platform, file-storage service, streaming platform, or SaaS provisioning system.

Those capabilities may integrate with the platform where required, but none defines the core product.

## Product philosophy

- Lead with catalogue value and commerce, not internal money mechanics.
- Model access and stable commercial facts, not speculative product categories.
- Keep ordinary users out of privileged catalogue management.
- Keep referral opportunity distinct from primary storefront messaging.
- Let destinations specialize while Cliqero owns entitlement authorization.
- Reduce scope without reducing financial, authorization, or audit integrity.
