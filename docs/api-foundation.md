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

## Hierarchy read model

Hierarchy configuration lives under `config/hierarchy/`. Commission depth and
visualization depth are independent. The visualization file controls a bounded
window (`depth`, default 3) and child page size (`child_limit`, default 50);
clients cannot override these values. `GET /api/hierarchy/tree` returns stable
nodes/edges and parent navigation context. Normal users may choose self or any
descendant as root; operators may choose any account, but both receive the same
bounded window. A direct upline is context only and cannot become a normal
user's traversal root. Search is constrained in SQL to the user's descendant
closure; operators may search globally. Re-parenting remains intentionally
deferred because parent relationships are immutable graph facts.

The mandatory operational commission file is
`config/hierarchy/distribution.yaml`; the tracked example is only a template
and remains separate from runtime configuration.
