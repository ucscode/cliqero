# Operator UI foundation

Cliqero keeps the operator console separate from the ordinary user dashboard at
`/operator`. The page is server-guarded from the canonical Cliqero principal:
ordinary accounts are redirected to the user dashboard, while `operator` and
`catalogue_manager` accounts are admitted.

The operator console now exposes Overview and the platform-managed Catalogue
section. It deliberately does not advertise users, treasury, payout execution,
provider, or operations controls before those workflows have their own UI. Catalogue
managers receive catalogue counts only; operators receive catalogue, account,
purchase, and withdrawal state counts.

Catalogue management is documented in `docs/operator-catalogue.md`. It uses the
existing Hono listing, media, and transfer APIs and never treats a manager as a
seller or payee.

Overview data comes from `GET /api/operator/overview`, a Hono-owned aggregate
projection. Browser sessions use the persisted role. API keys additionally need
`operations:manage` for the operator projection or `catalogue:read` for the
catalogue-manager projection. A scope never elevates the account role.

`GET /api/me/access` supplies the safe role projection used to show the optional
Operator console link in the user dashboard. It contains no secrets or
authorization credentials.
