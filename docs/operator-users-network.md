# Operator users and network

The operator console provides bounded account inspection at `/operator/users`
and hierarchy inspection at `/operator/network`. These pages are available only
to the direct account capabilities required by each operator section. Catalogue
access uses `catalogue.manage`; broader platform inspection uses the
corresponding direct capabilities.

Account search is server-side, bounded, and ordered by `(created_at, id)`.
Responses are safe projections: authentication secrets, API-key material,
provider credentials, and financial balances are not serialized. User detail
shows identity, parent context, direct-referral count, purchase count, and the
latest parent-reassignment audit fact. Direct capability assignments are read
and changed separately through the capability-administration endpoints when the
current browser session has `capabilities.manage`; account readers do not gain
that authority implicitly. The capability panel shows only rows stored for the
target account, while `system.root` is presented separately as master operator
authority.

Capability changes use explicit, idempotent grant/revoke operations:

```text
GET    /api/operator/accounts/{accountId}/capabilities
POST   /api/operator/accounts/{accountId}/capabilities
DELETE /api/operator/accounts/{accountId}/capabilities/{capability}
```

Only browser sessions may use these endpoints in Phase 2. A non-root capability
administrator may delegate an ordinary capability only when they themselves
hold it; only a root may change `system.root`. Root revocation is serialized and
the final root is protected. Successful changes are recorded in the existing
append-only `kernel.audit_records` stream.

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
