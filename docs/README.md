# Cliqero Documentation

Cliqero is a catalogue-led commerce platform with optional referral distribution and external access fulfillment.

The platform owns the commercial catalogue. Ordinary accounts browse, purchase, access purchases, and may promote eligible listings. Listing creation and publication are privileged operations for operators or accounts with the `catalogue_manager` capability. Ordinary users are not sellers.

The primary customer-facing commerce flow is:

> Catalogue → Buy → Entitlement → Access

Referral promotion is a secondary distribution capability:

> Eligible listing → attributed promotion → qualifying purchase → earnings

External payment providers only bring funds into the platform. They do not directly buy listings. Internal commerce spends available canonical USD value. Buyer funds, referral earnings, and company treasury are separate accounting domains.

The underlying thing represented by a listing may be software, a download, a service, a course, an offer, an application, a repository, or another externally fulfilled experience. Cliqero models the listing, purchase, entitlement, destination, and access boundary rather than inventing a domain model for every product type.

## Start here

- [Installation and Configuration](./installation-and-configuration.md) — local development, production-like execution, environment values, YAML configuration, persistence, and common commands.
- [Product Vision](./01-product-vision.md) — catalogue ownership, productless commerce, entitlement, destination, and access.
- [Roles and User Journeys](./02-roles-and-user-journeys.md) — visitor, buyer/member, promoter, catalogue manager, and operator journeys.
- [Listings, Profiles, and Access Links](./03-offers-profiles-and-links.md) — listing data, destinations, referral URLs, and source credentials.
- [Purchase and Entitlement Model](./04-campaign-and-action-model.md) — purchase lifecycle and entitlement consequences. The historical filename is retained for link stability.
- [Money, Wallets, and Currency](./05-money-wallets-and-currency.md) — internal funding, canonical accounting, earnings, settlement, withdrawals, and treasury boundaries.
- [Referrers, Promotion, and Referral Network](./06-promoters-and-referrals.md) — attributed promotion and network rules.
- [System Architecture](./07-system-architecture.md) — modular monolith, processors, Hono APIs, Docker Compose, Next.js, and failure isolation.
- [Configuration and Data Model](./08-configuration-and-data-model.md) — deployment values, YAML configuration, data invariants, metadata, and access credentials.
- [Reliability, Fraud, and Audit](./09-reliability-fraud-and-audit.md) — idempotency, financial/access integrity, and auditability.
- [Investor and Business Overview](./10-investor-business-overview.md) — catalogue-led business model and expansion strategy.
- [Initial Production Scope](./11-initial-production-scope.md) — current production scope and build boundaries.
- [Catalogue, Commission, and Treasury](./catalogue-treasury.md) — privileged catalogue ownership, commission policy, and platform treasury.
- [Authentication](./authentication.md) — Better Auth boundary and canonical account identity.
- [Application Console](./console.md) — user creation, password changes, and capability bootstrap.
- [API Foundation](./api-foundation.md) — Hono/OpenAPI, principals, sessions, API keys, and scopes.
- [Blog Platform](./blog-platform.md) — isolated SQLite content platform.
- [Wallet-first Commerce](./wallet-first-commerce.md) — funding and internal checkout workflow.
- [Listing Management and Media](./listing-management-and-media.md) — lifecycle, media providers, import, and export.
- [Public API Matrix](./public-api-matrix.md) — implemented application API surface.

## Current business invariants

1. Cliqero owns/provides the catalogue; ordinary users do not create listings.
2. `catalogue_manager` is a privileged catalogue capability, not a seller role.
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
