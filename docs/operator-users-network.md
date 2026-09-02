# Operator users and network

The operator console provides bounded account inspection at `/operator/users`
and hierarchy inspection at `/operator/network`. These pages are available only
to the `operator` capability. `catalogue_manager` remains intentionally limited
to the overview and catalogue surfaces.

Account search is server-side, bounded, and ordered by `(created_at, id)`.
Responses are safe projections: authentication secrets, API-key material,
provider credentials, and financial balances are not serialized. User detail
shows identity, capabilities, parent context, direct-referral count, purchase
count, and the latest parent-reassignment audit fact.

Operator network windows reuse the normal React Flow/Dagre hierarchy explorer
and the PostgreSQL recursive hierarchy service. Operators may choose an
arbitrary account root, search globally through the bounded account endpoint,
and continue wide branches with opaque child cursors. Visualization depth is a
per-window display limit, not a global hierarchy limit.

Parent changes use the existing `ReferralGraphService.reassignParent()` command
and `PUT /api/operator/hierarchy/{accountId}/parent`. PostgreSQL cycle guards,
transaction serialization, and the `referral.parent_reassigned` append-only
audit record remain authoritative. Dragging graph nodes is cosmetic and never
changes hierarchy relationships or historical purchases/distributions.
