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

## Account management

Account inspection remains read-only under `accounts.read` and the existing
`operations:manage` API-key scope. Account mutations require the separate
`accounts.manage` capability; API keys additionally require
`accounts:manage`. `system.root` inherits this recognized capability through the
normal capability model. Account readers do not receive mutation authority.

Supported management operations are:

```text
POST  /api/operator/accounts                 create an account
PATCH /api/operator/accounts/{accountId}      update username and/or country
```

Creation goes through the existing authentication/identity workflow. The
operator supplies email and username, with country optional. The service creates
a cryptographically random bootstrap credential, never returns or stores it in
plaintext, and requests a Better Auth password-reset email so the account holder
chooses their own password. If that email request fails, account creation still
completes and the API reports that the holder should use the normal Forgot
password flow. Parent assignment and capability grants remain separate
operations. Creation and profile updates are recorded in the append-only audit
stream.

Operator edits are limited to username and country. Email changes remain in the
account holder's Better Auth verification flow; display-name editing and
password resets are not operator profile fields. Username uniqueness is
enforced by the domain and database. The list's Add user and Edit account
actions are shown only to principals with account-management authority.

Authorized account managers can delete an account from its row, detail page, or
the bounded bulk action. Deletion tombstones the canonical account identity:
Better Auth identity and sessions are removed, API keys and integrations are
revoked, profile metadata and saved payout-destination details are cleared, and
the public username is released for reuse. Historical purchase, payment,
ledger, withdrawal, distribution, and audit facts retain their account UUID and
project the identity as `Deleted user` where a profile is shown. Owned listings
are archived. Immediate children of the deleted account become parentless roots;
their descendants stay attached to them, and no ancestor is substituted. Future
commission shares for hierarchy levels that no longer exist go to the platform.
Operators cannot delete themselves or the final `system.root` account.
Deletion uses `DELETE /api/operator/accounts/{accountId}`. The UI's bounded bulk
action repeats that canonical operation per selected account, reports individual
failures, and does not require a bulk API endpoint.

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
