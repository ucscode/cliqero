# Cliqero Documentation

Cliqero is a performance-promotion platform that connects two desires:

- advertisers want more people to discover and act on what they offer;
- promoters want to earn by bringing interested people to those offers.

Cliqero does not process the advertiser's underlying sale. It handles visibility, attribution, campaign funding, action tracking, rewards, referrals, wallets, and reporting.

The core commercial promise is simple:

> Advertisers do not pay because somebody merely saw an offer. They fund campaigns and pay when a visitor takes a defined action such as opening WhatsApp, calling, visiting a website, opening a social account, or following another configured destination.

The platform is designed as a production-grade modular system rather than a disposable MVP. Every important capability must be independently replaceable, removable, testable, and accessible through stable contracts.

## Documentation map

1. [Product Vision](./01-product-vision.md) — what Cliqero is, why it exists, and the market problem it solves.
2. [Roles and User Journeys](./02-roles-and-user-journeys.md) — advertisers, promoters, referrals, visitors, and administrators.
3. [Offers, Profiles, and Public Links](./03-offers-profiles-and-links.md) — advertiser profiles, reusable social channels, offer overrides, and the public URL model.
4. [Campaign and Action Model](./04-campaign-and-action-model.md) — how campaigns are funded, how actions become payable, and what advertisers are actually buying.
5. [Money, Wallets, and Currency](./05-money-wallets-and-currency.md) — USD canonical accounting, wallet-first movement, ledger rules, refunds, reversals, and withdrawals.
6. [Promoters and Referral Network](./06-promoters-and-referrals.md) — versatile promotion links, promoter attribution, referral graph behavior, and reward boundaries.
7. [System Architecture](./07-system-architecture.md) — modularity, capabilities, contracts, processors, events, OOP, Docker Compose includes, and Next.js surfaces.
8. [Configuration and Data Model](./08-configuration-and-data-model.md) — configuration layers, secrets, runtime settings, EAV usage, and relational invariants.
9. [Reliability, Fraud, and Audit](./09-reliability-fraud-and-audit.md) — idempotency, state machines, fraud resistance, immutable records, and graceful degradation.
10. [Investor and Business Overview](./10-investor-business-overview.md) — business model, network effects, value proposition, monetization, and expansion potential.
11. [Initial Production Scope](./11-initial-production-scope.md) — what the first reliable release includes and deliberately excludes.

## Architectural principle

A concise statement governs the entire system:

> Modules determine facts; processors coordinate consequences; the ledger records money; events communicate what happened.

A module must not access another module's internal storage or implementation. Cross-module behavior occurs through contracts, APIs, or events. Optional capabilities must degrade gracefully when unavailable instead of crashing unrelated parts of Cliqero.

## Product principle

Cliqero should remain valuable even if referral rewards disappeared tomorrow. Advertisers pay for genuine promotional outcomes. Promoters earn for producing those outcomes. Referral rewards are funded from real platform activity rather than participant entry fees.
