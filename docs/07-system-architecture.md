# System Architecture

[Back to documentation index](./README.md)

## Architectural goal

Cliqero must remain modular by default.

No capability should know another capability's internal implementation. A module may depend on a public contract, API, or event, but it must not reach into another module's database tables, classes, or provider-specific code.

The architecture should allow a capability to be removed, replaced, or moved into another container without forcing unrelated systems to be rewritten.

The product-model correction does not alter this architecture.

## Core law

> Modules determine facts; processors coordinate consequences; the ledger records money; events communicate what happened.

## Core commerce primitives

The stable commercial primitives are:

- **Listing** — metadata describing something that can be purchased;
- **Purchase** — the commercial fact that a buyer paid under specific terms;
- **Entitlement** — the buyer's right to access the listing;
- **Destination** — where authorized access is handed off.

The architecture must not create product-type modules such as ebook, software, course, template, or download unless a proven future requirement genuinely requires such a capability.

## Capability model

Important domains may be expressed as capabilities, for example:

- identity;
- seller/profile;
- listing;
- checkout/purchase;
- entitlement/access;
- attribution;
- affiliate/referral;
- payment;
- payout;
- wallet/ledger;
- currency;
- fraud/risk;
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

Examples:

Payment capability may have Paystack, USDT TRC-20, and future providers.

Payout capability may begin with a manual provider and later gain automated bank/crypto providers.

Currency capability may have one or more exchange-rate providers.

Adding or disabling a provider should be registry/configuration work rather than rewriting consumers.

## Processors

Processors orchestrate cross-module consequences.

Example: purchase completion processor

1. receive verified payment/purchase intent;
2. finalize purchase idempotently;
3. request entitlement creation/activation;
4. resolve valid referral attribution;
5. ask affiliate/referral capability for applicable distribution facts;
6. request ledger movements;
7. emit purchase-completed / entitlement-created / commission-distributed facts.

The listing module does not become a payment processor. The affiliate module does not become a wallet. The entitlement module does not calculate referral commission.

## Event-driven boundaries

Events represent facts that have occurred.

Examples:

- `payment.verified`;
- `purchase.completed`;
- `entitlement.created`;
- `entitlement.revoked`;
- `access.requested`;
- `access.authorized`;
- `commission.distributed`;
- `withdrawal.requested`;
- `withdrawal.completed`.

Consumers may react independently.

## Access capability

The access capability answers whether a buyer is entitled to a listing and creates/verifies access handoffs.

A destination link may receive:

`?source=<opaque-token>`

`source` is a cryptographically random opaque bearer credential. It is not a JWT/JWE claims container and contains no buyer, listing, purchase, entitlement, or pricing data.

The access capability owns the server-side mapping from the token to an access grant and from that grant to the relevant entitlement/purchase/listing/account relationships.

Where practical, persisted token material should be a secure hash rather than the raw bearer credential.

External destinations verify access through Cliqero's Access API. They must authenticate independently as integrations/API clients; the `source` bearer token is not an API-client credential.

The API returns only the minimum authorized context needed by that integration and treats current server-side entitlement/access state as authoritative.

The access capability must not know whether the destination serves a file, opens software, provisions an account, reveals an offer, or performs another product-specific action.

## API-first architecture

Cliqero should expose domain capabilities through stable APIs where external systems reasonably need them.

The access flow is explicitly API-first:

`destination -> authenticated Access API -> access capability -> entitlement truth`

Cliqero's own web surfaces should call the same underlying capability contracts rather than duplicating access rules in UI routes.

Future SDKs or libraries may wrap these APIs for supported languages/frameworks, but an SDK is a convenience client, not a second authorization engine.

## Graceful degradation

Optional module failure must not crash unrelated functionality.

Examples:

- currency unavailable => show canonical USD;
- affiliate unavailable => referral distribution is unavailable/queued according to policy, but unrelated listing access remains isolated;
- notifications unavailable => a purchase can still complete;
- analytics unavailable => purchase/access processing continues;
- Paystack disabled => other payment providers remain usable.

Critical dependencies such as payment verification, purchase finalization, ledger integrity, entitlement creation, and access authorization must fail safely rather than pretending success.

## OOP-first implementation

Cliqero should strongly prefer cohesive domain objects and services over procedural utility files.

Examples:

- `User` / `Account`;
- `Listing`;
- `Purchase`;
- `Entitlement`;
- `AccessGrant`;
- `Wallet`;
- `Money`;
- `AffiliateGraph`;
- `PaymentProvider`;
- `PurchaseCompletionService`;
- `CommissionDistribution`.

The goal is coherent behavior and domain boundaries, not mechanically turning every data object into a class.

## Application technology

The current web application technology is Next.js with TypeScript.

Next.js is an implementation choice for web surfaces, not the architecture of the entire system. Future capabilities may use other technologies where justified while honoring the same contracts.

## Docker Compose composition model

Cliqero remains designed around Docker Compose `include`.

The root Compose file acts primarily as composition. Feature/application directories own their own Compose files and overrides.

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

A capability may initially run in the same Node.js process as others and later be extracted into a dedicated service/container. Consumers continue to use the same conceptual contract through a local or remote adapter.

This avoids premature microservices while preserving extraction.

## Cross-module data ownership

Each module owns its persistence.

Other modules may retain stable IDs/references, but they ask the owner for domain information rather than querying its tables directly.

This is especially strict for:

- identity;
- listing;
- purchase;
- entitlement/access;
- wallet/ledger;
- affiliate graph;
- payment transactions;
- attribution records.

## APIs, webhooks, and events

External webhooks and APIs translate into domain operations rather than contain business logic directly.

Examples:

`Paystack webhook -> PaystackProvider.verify() -> payment.verified -> PurchaseCompletionProcessor`

`Destination verify request -> authenticated Access API -> Entitlement/Access capability -> authorization result`

Another payment provider can produce the same domain fact without purchase logic knowing the provider source.

## Production philosophy

Cliqero is not a disposable MVP.

The first release is intentionally limited in scope, but implemented features must be production-grade: modular, tested, auditable, idempotent, and recoverable.

> Reduce scope, never reduce integrity.
