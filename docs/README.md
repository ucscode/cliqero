# Cliqero Documentation

Cliqero is a productless commerce and referral platform.

A seller creates a listing with metadata, a price, and a destination. A referrer can share an attributed link and earn from a valid purchase. A buyer pays through Cliqero and receives an entitlement that allows access to the destination.

The core flow is:

> List -> Refer -> Buy -> Access

Cliqero deliberately does not define what kind of product exists behind the destination. It may be an ebook, software, a private application, a course, an offer, a download gateway, a repository, a service, or something not yet imagined.

The stable product model is:

- **Listing** — metadata describing something purchasable;
- **Purchase** — the commercial fact and immutable purchase terms;
- **Entitlement** — the buyer's access right;
- **Destination** — where authorized access is handed off.

When appropriate, access redirects append `?source=<token>`. `source` is a cryptographically random opaque bearer token. It is not JWT/JWE and contains no buyer, listing, purchase, entitlement, price, or other business data. Cliqero resolves it server-side to the access grant and related entitlement/purchase/listing/account graph.

Integrated destinations verify the token through Cliqero's authenticated Access API. The destination authenticates separately as an integration/API client; possession of `source` alone must not provide unrestricted access to Cliqero APIs. Server-side access state remains authoritative, which allows revocation and future access-policy changes without changing the public token format.

This product-model correction does **not** change the previously established architectural strategy. Cliqero remains modular, capability-driven, event-aware, API-powered, production-grade, and composed through grouped Docker Compose files using `include`.

## Documentation map

1. [Product Vision](./01-product-vision.md) — authoritative definition of productless commerce, listings, entitlements, destinations, and referral sales.
2. [Roles and User Journeys](./02-roles-and-user-journeys.md) — seller, referrer, buyer, visitor, administrator, and access journeys.
3. [Listings, Profiles, and Access Links](./03-offers-profiles-and-links.md) — generic listing data, destinations, referral URLs, opaque source tokens, and authenticated verification.
4. [Purchase and Entitlement Model](./04-campaign-and-action-model.md) — purchase lifecycle, entitlement creation, access handoff, and commission consequences. The filename is retained for link stability; the former campaign model is superseded.
5. [Money, Wallets, and Currency](./05-money-wallets-and-currency.md) — canonical accounting, payment verification, sale distribution, ledger rules, reversals, and withdrawals.
6. [Referrers, Promotion, and Referral Network](./06-promoters-and-referrals.md) — attributed links, sale-based commission, account referral graph behavior, and reward boundaries.
7. [System Architecture](./07-system-architecture.md) — modularity, capabilities, contracts, processors, events, API-first access, OOP, Docker Compose includes, and Next.js surfaces.
8. [Configuration and Data Model](./08-configuration-and-data-model.md) — configuration layers, secrets, generic listing schema, metadata/EAV, purchase snapshots, entitlements, access grants, and source-token rules.
9. [Reliability, Fraud, and Audit](./09-reliability-fraud-and-audit.md) — idempotency, payment/referral/access threats, token security, immutable records, and failure isolation.
10. [Investor and Business Overview](./10-investor-business-overview.md) — productless business model, seller/referrer/buyer value, economics, network effects, and expansion principle.
11. [Initial Production Scope](./11-initial-production-scope.md) — production V1 and build order centered on listing -> checkout -> purchase -> entitlement -> access.

## Architectural principle

A concise statement continues to govern the system:

> Modules determine facts; processors coordinate consequences; the ledger records money; events communicate what happened.

A module must not access another module's internal storage or implementation. Cross-module behavior occurs through contracts, APIs, or events. Optional capabilities degrade gracefully where safe instead of crashing unrelated parts of Cliqero.

## Product principle

The core rule for preventing scope drift is:

> Do not model the thing behind the link unless a real user requirement proves that Cliqero must understand it.

By default, new sellable things require new metadata, not new product architectures.

## Access principle

The external access contract is deliberately simple and stable:

> `source` is an opaque credential, not data. Cliqero resolves the data.

Do not replace this with self-contained JWT/JWE claims.

## Build constraint for Codex

Codex should treat these documents as the current product authority.

Do not reconstruct the superseded pay-per-action campaign model from repository history, old discussions, naming leftovers, or the historical filenames of documents 03/04/06.

The current business primitive is a paid listing that creates entitlement and access. Referrals earn from valid purchases. The established modular Docker Compose `include` architecture remains unchanged.
