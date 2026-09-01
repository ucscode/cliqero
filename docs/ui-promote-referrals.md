# Promote, referrals, and earnings UI

The authenticated dashboard now exposes three account-owned views:

- **Promote** loads the account's existing listing referral links, including
  the joined `listing_title` projection, from `GET /api/referral-links`. A
  link is created only when the user chooses Promote on a published listing
  (`POST /api/listings/{id}/referral-link`). The API-generated `/r/{code}` URL
  is the only shareable referral artifact; the browser never invents codes or
  attribution tokens. The list is owner-scoped and produced by one backend
  projection query, so the browser does not fetch each listing separately.
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
continues to use `/r/{code}` and the existing `cliqero_attribution` cookie, and
is resolved by checkout rather than by the UI. Pagination for time-ordered
purchase and earnings projections uses an opaque `(created_at, id)` keyset
cursor so records are not skipped when UUID order differs from creation order.

Referral analytics and operator referral UI remain intentionally deferred.
