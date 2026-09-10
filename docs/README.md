# Cliqero Documentation

Cliqero is a catalogue-led commerce platform with optional referral distribution and external access fulfillment.

The platform owns the commercial catalogue. Ordinary accounts browse, purchase, access purchases, and may promote eligible listings. Listing creation and publication require the direct `catalogue.manage` capability or `system.root`. Ordinary users are not sellers.

The primary customer-facing commerce flow is:

> Catalogue → Buy → Entitlement → Access

Referral promotion is a secondary distribution capability:

> Eligible listing → attributed promotion → qualifying purchase → earnings

External payment providers only bring funds into the platform. They do not directly buy listings. Internal commerce spends available canonical USD value. Buyer funds, referral earnings, and company treasury are separate accounting domains.

The underlying thing represented by a listing may be software, a download, a service, a course, an offer, an application, a repository, or another externally fulfilled experience. Cliqero models the listing, purchase, entitlement, destination, and access boundary rather than inventing a domain model for every product type.

## Start here

For a new model or developer, read [Continuity](./continuity/README.md) first, then [Current State](./continuity/current-state.md), [Requirements and Invariants](./continuity/requirements-and-invariants.md), and [Active Work](./continuity/active-work.md). Then inspect the code and use the topical docs below.

### Product

- [Vision](./product/vision.md)
- [Roles and Journeys](./product/roles-and-journeys.md)
- [Listings and Access](./product/listings-and-access.md)
- [Referrals](./product/referrals.md)
- [Business Overview](./product/business-overview.md)
- [Production Scope](./product/production-scope.md)

### Architecture

- [System Architecture](./architecture/system.md)
- [Configuration and Data Model](./architecture/configuration-and-data-model.md)
- [Reliability and Audit](./architecture/reliability-and-audit.md)

### Flows

- [Wallet-first Commerce](./flows/wallet-first-commerce.md)
- [Purchase and Entitlement](./flows/purchase-and-entitlement.md)
- [Money, Wallets, and Currency](./flows/money-wallets-and-currency.md)
- [Catalogue and Treasury](./flows/catalogue-and-treasury.md)

### Integrations and API

- [API Foundation](./integrations/api-foundation.md)
- [Authentication](./integrations/authentication.md)
- [Listing Management and Media](./integrations/listing-management-and-media.md)
- [Public API Matrix](./integrations/public-api-matrix.md)
- [Blog Platform](./integrations/blog-platform.md)

### Operations

- [Installation and Configuration](./operations/installation-and-configuration.md)
- [Local Authentication and Fixtures](./operations/local-auth-and-fixtures.md)
- [Application Console](./operations/console.md)
- [Operator Docs](./operations/)

### UI

- [UI Foundation](./ui/ui-foundation.md)
- [Frontend Component System](./ui/frontend-component-system.md)
- [UI Settings](./ui/ui-settings.md)
- [UI Withdrawals](./ui/ui-withdrawals.md)
- [UI Promotion and Referrals](./ui/ui-promote-referrals.md)

Examples for listing import/export are under [integrations/examples](./integrations/examples/).

## Current business invariants

1. Cliqero owns/provides the catalogue; ordinary users do not create listings.
2. `catalogue.manage` is a privileged catalogue capability, not a seller role.
3. External providers fund internal buyer value only.
4. A listing purchase is paid internally and creates a durable purchase fact.
5. Entitlement/access is independent from referral distribution processing.
6. Referral earnings originate only from qualifying completed commerce.
7. There is no authoritative mutable buyer-wallet, earnings, or treasury balance.
8. Canonical authoritative money is integer USD minor units.
9. `source` access credentials are opaque random server-resolved credentials, never self-contained JWT/JWE business claims.
10. PostgreSQL owns the commercial/accounting domain; blog content lives independently in SQLite.

## Architecture principle

> Modules determine facts; processors coordinate consequences; append-only records preserve financial truth; events communicate what happened.

Cross-capability behavior goes through contracts, APIs, persisted facts, or events rather than reaching into another module's private storage.

## Documentation warning

Some historical filenames and database fields predate the current catalogue-owned model. A filename containing words such as `campaign` or a legacy `seller_id` column does not restore the superseded business model. Where an older document contradicts the invariants above, this index and the newer capability-specific documentation take precedence until that document is rewritten.
