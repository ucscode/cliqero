# Headless API foundation

Hono is the authoritative Cliqero application-API boundary mounted by Next.js
at `/api/[[...route]]`. It provides shared Zod contracts, protected OpenAPI generation at
`/api/openapi.json`, principal/error middleware, and one dispatch path for the
application capabilities. Existing capability services remain authoritative;
Hono handlers do not contain business rules.

Better Auth browser sessions and hashed Cliqero API keys both resolve to one
`ApiPrincipal` containing the canonical Cliqero `accountId`, direct Cliqero capabilities, and
(for keys) explicit scopes. A key cannot elevate its owner's authorization.
Secrets are returned once at creation and never persisted or logged in
plaintext. Compatibility handler modules are internal adapters and are not
independently routable Next.js endpoints.

The API-key scope registry is capability-oriented and finite: `hierarchy:read`,
`hierarchy:admin`, `api_keys:manage`, `catalogue:read`, `catalogue:manage`,
`wallet:read`, `wallet:fund`, `checkout:create`, `purchases:read`,
`referrals:read`, `referrals:manage`, `earnings:read`, `withdrawals:read`,
`withdrawals:create`, `withdrawals:manage`, `treasury:read`,
`treasury:manage`, `operations:manage`, and `reviews:moderate`. Unknown or misspelled scopes are
rejected at both the HTTP contract and service boundary. Compatibility routes
declare whether they are anonymous, session-only, integration-credential-only,
or account routes requiring one of these scopes. The development funding
verification compatibility route is session-only and disabled whenever
`NODE_ENV=production`; production confirmation comes from provider verification
workers/webhooks instead. A scope never elevates the owning account's Cliqero
capability.

Operator API-key administration is account-scoped at
`/api/operator/accounts/{accountId}/api-keys`. It requires the actor's
`api_keys.manage` capability (and `api_keys:manage` when the actor is itself an
API-key principal). Operator-sensitive scopes are only assignable when the
actor and target currently hold the corresponding account capability; the
target's capability remains required on every subsequent request.

## API route ownership

The compatibility route modules under `src/api/compat` are invoked only by the
Hono dispatch registry. They are not alternate business implementations or
independently routable Next.js endpoints. Better Auth's `/api/auth/[...all]`
protocol handler remains a Next.js exception because it owns its protocol, and
Paystack webhook ingress remains provider-specific so raw-body/signature
verification is preserved. Browser navigation routes such as
`/access/{purchaseId}` remain outside the JSON API; the legacy
`/api/listings/{id}/access` redirect alias is dispatched through Hono with the
same session-only guard as the canonical browser route.

All ordinary Cliqero application API paths (catalogue, wallet, checkout,
purchases, referrals, earnings, withdrawals, treasury, integrations, and
operator commands) are represented in the generated OpenAPI document and enter
through the single Hono catch-all before the shared application handlers run.

## OpenAPI schema discovery

Cliqero intentionally supports production schema discovery for agents and
automation. In development, `GET /api/openapi.json` is public. In every other
environment it requires `X-OpenAPI-Key` with the deployment-owned
`OPENAPI_KEY` environment secret. Missing or empty non-development
configuration fails closed and returns `404`, as do missing or incorrect keys.

The schema key authorizes **only schema retrieval**. It is not a Cliqero API
key, does not resolve to an account/principal, and cannot call business routes.
An n8n or agent discovery request is therefore:

```http
GET /api/openapi.json
X-OpenAPI-Key: <schema-discovery-secret>
```

After reading the generated contract, the consumer must use its separate
Cliqero API key or Better Auth session and the endpoint's normal scopes/capabilities
for actual API requests. No interactive documentation or alternate schema
route is registered.

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
may search globally. Parent reassignment is restricted to the operator command
below; ordinary users cannot mutate graph relationships.

Operator-controlled parent reassignment is now available at
`PUT /api/operator/hierarchy/{accountId}/parent` with
`{"parent_account_id":"..."}`. It changes only the selected adjacency-list
row; descendants are not rewritten and existing financial snapshots are never
changed. PostgreSQL advisory locking, recursive cycle validation, account
foreign keys, and an audit record protect the mutation. Deleting referral
relationships remains blocked; use the command only for valid assignment or
reassignment. Operator API keys require the `hierarchy:admin` scope in addition
to the required direct capability.

The mandatory operational commission file is
`config/hierarchy/distribution.yaml`; the tracked example is only a template
and remains separate from runtime configuration.
