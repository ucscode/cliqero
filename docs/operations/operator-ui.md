# Operator UI foundation

Cliqero keeps the operator console separate from the ordinary user dashboard at
`/operator`. The page is server-guarded from the canonical Cliqero principal:
ordinary accounts are redirected to the user dashboard. Accounts with at least
one direct operator capability are admitted, and each section checks its own
capability at the server boundary.

The operator console exposes the sections supported by the account's direct
capabilities. Sections that do not yet have a corresponding operator UI are
not advertised, even when their capability exists.

Catalogue management is documented in `docs/operations/operator-catalogue.md`. It uses the
existing Hono listing, media, and transfer APIs and never treats an authorized
operator as a seller or payee.

Overview data comes from `GET /api/operator/overview`, a Hono-owned aggregate
projection. Browser sessions use the account's direct capabilities. API keys
must also carry a scope appropriate to the operation. A scope never elevates
the account's capabilities.

`GET /api/me/access` supplies a safe capability projection used to show the
optional Operator console link in the user dashboard. It contains no secrets or
authorization credentials.

Operator collection limits are centralized in the commented
`config/operator.yaml`. The API enforces its configured maximum page size and
the shared table UI uses the validated page-size options exposed by
`GET /api/operator/table-config`. Filtered tables provide a shared Clear action;
the displayed results change only after a successful request. Selection is
limited to visible rows and is cleared on filter/page changes. Only content
articles currently expose bounded bulk publication and deletion operations;
financial records, reviews, and accounts do not expose unsafe bulk actions.

Blog categories are managed under Operator → Blog → Categories and posts select
an existing category; categories assigned to posts cannot be deleted. Tags
remain a normalized relationship but continue to use comma-separated post
editor input, which resolves/creates tag records on save. Draft preview opens a
new tab using the public article renderer and requires both the authenticated
content-management session and a five-minute post/account-bound signed token.
Preview pages are dynamic, private/no-store, and marked noindex.

In local Compose development, Node dependencies live in the named
`cliqero-node-modules` and `cliqero-web-node-modules` volumes, not host
`node_modules`. Use `just deps` after synchronizing a lockfile or `just npm-add`
and `just npm-remove` for dependency edits; these do not rebuild the image.
`just dev-build` is reserved for Dockerfile, base-image, OS-package, and image
build-stage changes. `just deps-clean` removes only dependency volumes, while
`just dev-clean` removes every development volume, including database and
blog/media data.
