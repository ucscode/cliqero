# Configuration and Data Model

[Back to documentation index](./README.md)

## Configuration philosophy

Configuration is separated by responsibility rather than placed into one global environment namespace.

- `.env` — deployment/bootstrap values.
- `config/` YAML — capability/provider/policy configuration.
- PostgreSQL — runtime commercial/accounting/identity facts and auditable administrative state.
- SQLite — isolated blog content.

Tracked `*.example.yaml` files document supported provider configuration. Real YAML provider files are ignored by Git and excluded from normal source control.

YAML can explicitly reference environment values with `%env(NAME)%`; environment variables do not implicitly override YAML authority.

## Deployment values

Environment variables cover concerns such as application URL, PostgreSQL bootstrap connection, Better Auth bootstrap values, ports, and persistent paths. See [Installation and Configuration](./installation-and-configuration.md).

Provider credentials belong to provider configuration rather than becoming an ever-growing flat application environment.

## Referral commission policy

Referral commission policy is fixed/readymade YAML, not editable database configuration. `config/hierarchy/distribution.yaml` defines contiguous percentage levels. Explicit `levels: null` or `levels: {}` represents no referral commissions. Missing configured uplines are not redistributed; their share remains with the platform.

Applied policy is immutably snapshotted when distribution is created.

## Catalogue-owned listing model

Ordinary users are not sellers. Listing management is restricted to operator or `catalogue_manager` capability.

Stable listing data includes identity, title/presentation, canonical price, destination reference, lifecycle state, media, metadata, and audit timestamps. A creator/manager audit reference must not be interpreted as seller/payee semantics.

Historical `seller_id`-style fields may remain for compatibility/audit but are not authoritative economics for new wallet purchases.

## Metadata philosophy

Use JSON/EAV/key-value structures for peripheral or evolving attributes where relational integrity is unnecessary. Keep core authorization, commercial, accounting, and identity invariants relational.

Core relational examples include account identity, listing identity/state, purchase snapshots, entitlement ownership/state, access-grant token hash, funding/payment facts, ledger facts, referral graph/attribution, withdrawals, treasury entries, idempotency, and audit identifiers.

## Money representation

Authoritative money is integer USD minor units:

- `$0.01` → `1`
- `$1.00` → `100`
- `$10.00` → `1000`

APIs should prefer explicit `amount_minor`. Floating point is never authoritative accounting state.

There is no authoritative mutable buyer-wallet, earnings, or company-treasury balance. Each is a projection over its own append-only facts.

## Purchase snapshot

A purchase preserves the terms that applied at checkout, including listing, buyer, canonical amount, referral attribution where present, and enough immutable context to explain later entitlement/distribution consequences. Later catalogue edits must not rewrite purchase history.

New wallet commerce does not snapshot an ordinary-user seller/payee because ordinary users do not own commercial inventory.

## Entitlement

Entitlement is explicit relational state. It references buyer/account, listing, originating purchase, state, and timestamps. Expiry may be nullable; a valid entitlement is active and either has no expiry or expires in the future.

## Access credential

`source` is a cryptographically random opaque bearer credential. It is stored/resolved server-side (preferably by secure hash) and never encodes buyer, listing, purchase, entitlement, price, or other business claims. It is not JWT/JWE.

The canonical browser access route is `/access/{purchaseId}`. It authenticates the buyer, verifies ownership and entitlement, resolves the destination, issues the opaque credential where needed, and redirects.

## State and audit

Important workflows use explicit states rather than contradictory boolean collections. Financial corrections append new facts rather than rewriting or deleting original financial records.

Material administrative actions and provider operations must remain auditable with actor, time, correlation/idempotency identity, and relevant before/after semantics where applicable.
