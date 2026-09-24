# Configuration and Data Model

[Back to documentation index](../README.md)

## Configuration philosophy

Configuration is separated by responsibility rather than placed into one global environment namespace.

- `.env` — deployment/bootstrap values.
- `config/` YAML — capability/provider/policy configuration.
- PostgreSQL — runtime commercial/accounting/identity facts and auditable administrative state.
- SQLite — isolated blog content.

Tracked `*.example.yaml` files document supported provider configuration. Real YAML provider files are ignored by Git and excluded from normal source control.

Every Cliqero configuration YAML uses the `imports` + `parameters` envelope.
The central loader recursively composes explicitly imported YAML files relative
to their importer, deep-merges mappings, concatenates arrays in order, and
applies the importing file's parameters last. Imports split one complex config;
they do not create a global configuration tree. Environment placeholders are
resolved after composition, and environment variables do not implicitly
override YAML authority.

Object storage configuration uses named instances. The `providers` map key is
the persisted storage instance identity; the nested `provider` value is only
the driver implementation. `visibility: public` permits public URL generation,
while `visibility: private` is reserved for server-side access. Visibility is
provider capability metadata, not a feature-level policy: each operation checks
the capability it actually needs. Module-level `media_provider` values
reference these instance keys.

Withdrawal methods are data-collection/presentation definitions in
`config/modules/withdrawal/methods.yaml`, not payout providers. Define explicit
method IDs, country eligibility, and ordered `text`/`fixed` fields; never add
transfer credentials or an outbound executor. The tracked
`config/modules/withdrawal/methods.example.yaml` is the schema example. Like
other Cliqero YAML, the runtime file uses `parameters` and may optionally
compose relative YAML imports through the central loader; withdrawal code
consumes the resulting effective parameters.

## Deployment values

Environment variables cover concerns such as application URL, PostgreSQL bootstrap connection, Better Auth bootstrap values, ports, and persistent paths. See [Installation and Configuration](../operations/installation-and-configuration.md).

Provider credentials belong to provider configuration rather than becoming an ever-growing flat application environment.

## Referral commission policy

Referral commission policy is fixed/readymade YAML, not editable database configuration. `config/hierarchy/distribution.yaml` defines an explicit platform percentage and sparse positive hierarchy levels, where Level N is the buyer's Nth upline. Explicit `levels: null` or `levels: {}` represents no referral allocations. Missing configured uplines are allocated to the platform; the seller receives the remaining share.

Applied policy is immutably snapshotted when distribution is created.

## Catalogue-owned listing model

Ordinary users are not sellers. Listing management is restricted to the direct `catalogue.manage` capability (or `system.root`).

Stable listing data includes identity, title/presentation, canonical price, destination reference, lifecycle state, media, metadata, and audit timestamps. A creator/manager audit reference must not be interpreted as seller/payee semantics.

Historical `seller_id`-style fields may remain for compatibility/audit but are not authoritative economics for new wallet purchases.

## Metadata philosophy

Use JSON/EAV/key-value structures for peripheral or evolving attributes where relational integrity is unnecessary. Keep core authorization, commercial, accounting, and identity invariants relational.

Core relational examples include account identity, listing identity/state, purchase snapshots, entitlement ownership/state, access-grant token hash, funding/payment facts, ledger facts, referral graph/attribution, withdrawals, treasury entries, idempotency, and audit identifiers. Saved withdrawal destinations store validated ordered details as JSONB; each withdrawal separately snapshots its destination so edits cannot rewrite financial history.

No established application-level encrypted-field convention currently exists.
Withdrawal destination details therefore use the required validated PostgreSQL
JSONB storage without bespoke encryption. The feature does not log destination
values, restricts full saved-destination reads to the owning account, limits
full withdrawal snapshots to authorized operator detail, and keeps ordinary
customer history reduced to method/name identity.

## Money representation

Authoritative money is integer USD minor units:

- `$0.01` → `1`
- `$1.00` → `100`
- `$10.00` → `1000`

APIs should prefer explicit `amount_minor`. Floating point is never authoritative accounting state.

There is no authoritative mutable buyer-wallet, earnings, or company-treasury balance. Each is a projection over its own append-only facts.

## Purchase snapshot

A purchase preserves the terms that applied at checkout, including listing, buyer, canonical amount, referral attribution where present, and enough immutable context to explain later entitlement/distribution consequences. Later catalogue edits must not rewrite purchase history.

New wallet commerce preserves the listing seller snapshot and distribution creates the configured seller proceeds entry. The catalogue manager/audit identity is not thereby granted a new marketplace role.

## Entitlement

Entitlement is explicit relational state. It references buyer/account, listing, originating purchase, state, and timestamps. Expiry may be nullable; a valid entitlement is active and either has no expiry or expires in the future.

## Access credential

`source` is a cryptographically random opaque bearer credential. It is stored/resolved server-side (preferably by secure hash) and never encodes buyer, listing, purchase, entitlement, price, or other business claims. It is not JWT/JWE.

The canonical browser access route is `/access/{purchaseId}`. It authenticates the buyer, verifies ownership and entitlement, resolves the destination, issues the opaque credential where needed, and redirects.

## State and audit

Important workflows use explicit states rather than contradictory boolean collections. Financial corrections append new facts rather than rewriting or deleting original financial records.

Material administrative actions and provider operations must remain auditable with actor, time, correlation/idempotency identity, and relevant before/after semantics where applicable.
