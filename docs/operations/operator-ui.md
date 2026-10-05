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

Overview data comes from `GET /internal/overview`, an application-only aggregate
projection. Browser sessions use the account's direct capabilities. API keys
must also carry a scope appropriate to the operation. A scope never elevates
the account's capabilities.

`GET /internal/me/access` supplies a safe capability projection used to show the
optional Operator console link in the user dashboard. It contains no secrets or
authorization credentials.

The site-wide cursor-page maximum is configured as `parameters.crud.table.max_rows`
in `config/site.yaml`. Server list routes enforce the same limit; the browser
does not fetch a CRUD-configuration endpoint or expose a rows-per-page control.
Filtered tables provide a shared Clear action and selection is confined to the
visible page, then cleared on filter/page changes. Blog articles support bulk
deletion, catalogue listings support lifecycle actions, and reviews support
moderation. `system.root` can select and delete records in each of the 14
Operator collections; ordinary roles see only actions permitted by their
capabilities.

Blog categories are managed under Operator → Blog → Categories and posts may
select multiple existing categories. A `system.root` deletion removes the
category assignments while preserving the posts. Tags remain a normalized relationship but continue to use
comma-separated post editor input, which resolves/creates tag records on save.
The Status field controls the canonical article state when the form is saved.
Preview stores the current editor form in a separate expiring snapshot and
opens a new tab using the public article renderer; it does not save or publish
the canonical article. Preview reads require the owning content-management
session. Preview pages are dynamic, private/no-store, and marked noindex.

Account deletion intentionally preserves the canonical identity row as a
redacted tombstone. Historical purchases, funding, ledger movements, and other
records use restrictive, non-null account references; deleting that identity
would erase or detach their accountable ownership. The deletion workflow removes
credentials/capabilities, revokes active referrals and sessions, redacts the
profile, and detaches the hierarchy edge in one transaction. This is the
account domain's explicit tombstone model, not a general root-delete restriction.

In local Compose development, Node dependencies live in the named
`cliqero-node-modules` and `cliqero-web-node-modules` volumes, not host
`node_modules`. Use `just dev-deps` after synchronizing a lockfile or
`just dev-npm-add` and `just dev-npm-remove` for dependency edits; these do not rebuild the image.
`just dev-build` is reserved for Dockerfile, base-image, OS-package, and image
build-stage changes. `just dev-deps-clean` removes only dependency volumes, while
`just dev-clean` removes every development volume, including database and
blog/media data.
