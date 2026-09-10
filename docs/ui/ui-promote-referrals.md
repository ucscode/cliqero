# Promote, referrals, and earnings UI

The authenticated dashboard now exposes three account-owned views:

- **Promote** is available on an authenticated published listing. The server
  returns a deterministic `/r/{account-uuid}/{listing-uuid}` URL; no referral
  link row, generated code, rotation, or revocation lifecycle is required.
  Visits still create an opaque, hashed attribution token in the database for
  the existing 30-day purchase attribution window.
- **Referrals** combines an accessible network summary with the graphical
  React Flow/Dagre explorer. The hierarchy API remains the authorization
  boundary; the browser does not fetch a global graph or infer relationships.
  Visualization depth is a bounded window, not a traversal limit: users can
  rebase onto authorized descendants to explore deeper generations. Each node
  may load another deterministic child batch using the server-provided cursor.
  At the user's own root, an external upline can be shown as context but is
  never navigable. A rebased descendant exposes its permitted parent for
  upward navigation. Dragging nodes is cosmetic and never changes referral
  relationships.
- **Earnings** shows the earnings projection and immutable ledger entries from
  `GET /api/earnings` and `GET /api/earnings/entries`. Pending and available
  states are displayed as returned by the ledger; visits do not imply a
  commission.

All amounts are rendered from canonical USD minor units. Referral attribution
continues to use the deterministic `/r/{referrer}/{listing}` URL and the
existing `cliqero_attribution` cookie, and is resolved by checkout rather than
by the UI. Pagination for time-ordered
purchase and earnings projections uses an opaque `(created_at, id)` keyset
cursor so records are not skipped when UUID order differs from creation order.

Referral analytics and operator referral UI remain intentionally deferred.
