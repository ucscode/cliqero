# Operator catalogue management

Cliqero's catalogue is platform-managed. `operator` and `catalogue_manager`
principals manage listings through the operator console; ordinary accounts are
not sellers and never select a seller or payee when creating a listing.

The operator UI is available at `/operator/catalogue`, with dedicated create and
edit pages. Listing lifecycle commands use the existing Hono APIs: drafts can be
published, published listings can be archived, and archived listings can be
restored to draft. Deletion is therefore an archive operation so purchases,
entitlements, access records, and immutable financial snapshots remain safe.

Listings use integer USD minor units and provider-neutral media storage. Uploads,
ordering, deletion work, and JSON/CSV/YAML import/export all remain backed by
the existing application services and bounded transfer contracts.

The historical `listing_capability.listings.seller_id` column remains for
compatibility and purchase/distribution snapshots. It is not used to authorize
operator catalogue management: the API requires the caller's
`operator`/`catalogue_manager` capability and the `catalogue:manage` API-key
scope where applicable. Catalogue creation stores the manager as legacy audit
metadata because the current schema requires the column; it is not a seller or
payee designation for the platform-managed wallet-first purchase path.

Listing access-verification integrations are exposed only within a privileged
listing editor. Their credentials are hashed at rest, returned once on create or
rotation, and can be revoked. They are scoped to the listing rather than used as
ordinary-user ownership proof.
