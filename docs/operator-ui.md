# Operator UI foundation

Cliqero keeps the operator console separate from the ordinary user dashboard at
`/operator`. The page is server-guarded from the canonical Cliqero principal:
ordinary accounts are redirected to the user dashboard. Accounts with at least
one direct operator capability are admitted, and each section checks its own
capability at the server boundary.

The operator console exposes the sections supported by the account's direct
capabilities. Sections that do not yet have a corresponding operator UI are
not advertised, even when their capability exists.

Catalogue management is documented in `docs/operator-catalogue.md`. It uses the
existing Hono listing, media, and transfer APIs and never treats an authorized
operator as a seller or payee.

Overview data comes from `GET /api/operator/overview`, a Hono-owned aggregate
projection. Browser sessions use the account's direct capabilities. API keys
must also carry a scope appropriate to the operation. A scope never elevates
the account's capabilities.

`GET /api/me/access` supplies a safe capability projection used to show the
optional Operator console link in the user dashboard. It contains no secrets or
authorization credentials.
