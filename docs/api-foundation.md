# Headless API foundation

Hono is a thin HTTP boundary mounted by Next.js at `/api/[[...route]]`. It
provides shared Zod contracts, OpenAPI generation at `/api/openapi.json`, and
principal/error middleware; existing capability services remain authoritative.

Better Auth browser sessions and hashed Cliqero API keys both resolve to one
`ApiPrincipal` containing the canonical Cliqero `accountId`, Cliqero roles, and
(for keys) explicit scopes. A key cannot elevate its owner's authorization.
Secrets are returned once at creation and never persisted or logged in
plaintext. Existing Next route handlers remain compatibility routes while
capability endpoints migrate incrementally.

The current scope registry is intentionally small: `hierarchy:read`,
`hierarchy:admin`, and `api_keys:manage`. Unknown or misspelled scopes are
rejected at both the HTTP contract and service boundary.

## Hierarchy read model

Hierarchy configuration lives under `config/hierarchy/`; only distribution and
visualization policy files are present (referral parentage is database domain
state, not configuration). The required operational visualization
file must contain `hierarchy.visualization.depth` and `child_limit` as positive
integers. Commission depth and visualization depth are independent. Depth is a
rendered window, not an authorization ceiling. `GET /api/hierarchy/tree`
returns stable nodes/edges and parent navigation context; each node advertises
whether more direct children exist. `GET /api/hierarchy/children/{parentId}`
continues a branch using a stable UUID cursor, returning at most the configured
child limit per batch. Normal users may choose self or any descendant as root;
operators may choose any account, but both receive the same bounded window. A
direct upline is context only and cannot become a normal user's traversal root.
Search is constrained in SQL to the user's entire descendant closure; operators
may search globally. Re-parenting remains intentionally deferred because parent
relationships are immutable graph facts.

The mandatory operational commission file is
`config/hierarchy/distribution.yaml`; the tracked example is only a template
and remains separate from runtime configuration.
