# System Architecture

[Back to documentation index](./README.md)

## Architectural goal

Cliqero must be modular by default.

No capability should know another capability's internal implementation. A module may depend on a public contract, API, or event, but it must not reach into another module's database tables, classes, or provider-specific code.

The architecture should allow a capability to be removed, replaced, or moved into another container without forcing unrelated systems to be rewritten.

## Core law

> Modules determine facts; processors coordinate consequences; the ledger records money; events communicate what happened.

## Capability model

Important domains are expressed as capabilities, for example:

- identity;
- advertiser;
- offers;
- campaign;
- attribution;
- affiliate/referral;
- payment;
- payout;
- wallet/ledger;
- currency;
- fraud;
- moderation;
- notifications;
- analytics.

A consumer asks for a capability through a registry or contract rather than importing a provider implementation directly.

## Module boundary

A module should conceptually contain:

- manifest;
- contract/interface;
- implementation;
- owned persistence;
- optional provider registry;
- optional API surface;
- emitted/consumed events;
- tests.

A module must not access another module's internal storage.

## Providers

Capabilities may have multiple providers.

Example:

Payment capability:

- Paystack provider;
- USDT TRC-20 provider;
- future providers.

Payout capability:

- manual payout provider;
- future automated bank/crypto providers.

Currency capability:

- one or more exchange-rate providers.

Adding or disabling a provider should be registry/configuration work rather than rewriting consumers.

Providers should describe their capabilities, such as supported currencies or operations, so the platform can choose compatible implementations.

## Processors

Processors orchestrate cross-module effects.

Example: commission distribution processor

1. receive a qualified-action event;
2. obtain campaign/action value;
3. obtain promoter attribution;
4. ask affiliate/referral capability for applicable uplines;
5. calculate configured shares;
6. request ledger movements;
7. emit distribution-completed event.

The affiliate module does not become a commission processor. The campaign module does not become a wallet. The wallet does not decide referral structure.

## Event-driven boundaries

Events represent facts that have occurred.

Examples:

- `payment.verified`;
- `wallet.funded`;
- `campaign.activated`;
- `action.observed`;
- `action.qualified`;
- `commission.distributed`;
- `withdrawal.requested`;
- `withdrawal.completed`.

Consumers may react independently.

Tracking should not need to know whether analytics, notifications, affiliate rewards, or another future subscriber exists.

## Graceful degradation

Optional module failure must not crash unrelated functionality.

Examples:

- currency unavailable => show canonical USD;
- affiliate module unavailable => referral distribution unavailable, but unrelated offers/payments continue;
- notification module unavailable => transaction succeeds without notification;
- analytics unavailable => action processing continues;
- Paystack disabled => other payment providers remain usable.

Internal errors should be expressed through standard capability results/errors rather than leaking implementation exceptions across boundaries.

## OOP-first implementation

Cliqero should strongly prefer cohesive domain objects and services over procedural utility files.

Examples:

- `User` / `Account`;
- `Wallet`;
- `Money`;
- `Campaign`;
- `Offer`;
- `CurrencyQuote`;
- `AffiliateGraph`;
- `PaymentProvider`;
- `CampaignFundingService`;
- `CommissionDistribution`.

The goal is not to turn every data object into a class mechanically. The goal is to keep behavior with coherent domain concepts instead of exporting large collections of unrelated functions.

## Application technology

The current web application technology is Next.js with TypeScript.

Next.js is an implementation choice for web surfaces, not the architecture of the entire system. Future capabilities may use other technologies where justified while still honoring the same contracts and integration boundaries.

## Docker Compose composition model

Cliqero is designed around Docker Compose `include`.

The root Compose file acts primarily as composition. Feature/application directories can own their own Compose files and overrides.

Conceptual structure:

```text
compose.yaml
compose.override.yaml
apps/
modules/
services/
  main/
    compose.yaml
    compose.override.yaml
  showcase/
    compose.yaml
    compose.override.yaml
  affiliate/
    compose.yaml
    compose.override.yaml
  future-service/
    compose.yaml
    compose.override.yaml
```

A new independently deployable service should be addable by:

1. creating its directory;
2. creating its Compose definition/override;
3. adding one include entry to the root composition.

Existing modules should not require rewriting just because a new container appears.

## Containers versus modules

Logical modularity comes first. A module does not need its own container to be modular.

A capability may initially run in the same Node.js process as other capabilities and later be extracted into a dedicated service/container.

Consumers should continue talking to the same conceptual contract through a local or remote adapter.

This avoids premature microservices while preserving future extraction.

## Public web surfaces

The expected public host separation is:

- main domain: authenticated platform/dashboard;
- `s.`: advertiser showcase and offer pages;
- `a.`: promoter-attributed pages and discovery routes;
- `r.`: referral attribution.

These surfaces may initially share application technology while remaining logically separated.

## Cross-module data ownership

Each module owns its persistence.

Other modules may retain stable IDs/references, but they must ask the owner for domain information rather than querying its tables directly.

This rule is especially strict for:

- wallet/ledger;
- affiliate graph;
- campaign;
- identity;
- payment transactions;
- attribution/action records.

## APIs, webhooks, and events

External webhooks and APIs should translate into domain operations rather than contain business logic directly.

Example:

`Paystack webhook -> PaystackProvider.verify() -> payment.verified -> WalletFundingProcessor`

Another provider can produce the same domain event without the wallet funding logic knowing the provider source.

## Production philosophy

Cliqero is not a disposable MVP.

The first release is intentionally limited in scope, but implemented features must be production-grade: modular, tested, auditable, idempotent, and recoverable.

The guiding rule is:

> Reduce scope, never reduce integrity.
