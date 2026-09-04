# Cliqero

Cliqero is a catalogue-led commerce platform for selling access to externally fulfilled products and services. The platform owns the commercial catalogue; ordinary accounts browse, purchase, access purchases, and may participate in referral promotion. Catalogue creation is restricted to operators and accounts granted catalogue-management capability.

The stable commerce model is:

> Catalogue → Buy → Entitlement → Access

Referral distribution is an optional growth capability around that commerce flow, not the public identity of the product.

The authoritative product and architecture documentation starts at [docs/README.md](docs/README.md).

## Requirements

- Docker Engine
- Docker Compose with `include` support
- `just`
- Node.js 22+ and npm 11+ only when running repository tooling directly on the host

## Installation

Clone the repository, create local configuration, build the development images, and start the stack:

```bash
git clone <repository-url>
cd cliqero
cp .env.example .env
just dev-build
```

The application is available at `http://localhost:3000`; health is exposed at `/api/health`.

For subsequent development starts use:

```bash
just dev
```

Useful commands:

```bash
just help
just dev-ps
just dev-logs
just shell
just worker-shell
just db-shell
just test
just typecheck
```

`just dev-clean` is destructive: it removes local Compose volumes and their data.

## Production-like local run

Development and production deliberately use different image identities. Development uses `cliqero-main-dev`; production uses `cliqero-main-prod`. This prevents one mode from reusing the other mode's Docker stage.

```bash
just prod-build
just prod-ps
just prod-logs
```

Production recipes explicitly use `compose.yaml` and therefore do not load the development override. The production web container runs the standalone Next.js server rather than the development server.

## Configuration

Start with `.env.example`. Environment variables are reserved for deployment/bootstrap concerns such as application URL, database connection, authentication bootstrap values, and persistent paths.

Capability and provider configuration belongs under `config/`. Tracked `*.example.yaml` files document supported configuration; real `*.yaml`/`*.yml` provider files are ignored by Git. YAML may reference deployment values explicitly with `%env(NAME)%`.

Example:

```yaml
callback_url: "%env(APP_URL)%/payments/provider/callback"
```

Use `%%env(NAME)%%` when the placeholder must remain literal.

Provider configuration is optional by capability. External payment providers fund the buyer account balance; they do not directly purchase listings. The internal checkout consumes available canonical USD value. Referral commission policy is defined independently from payment providers.

See [Installation and Configuration](docs/installation-and-configuration.md) for the complete setup model.

## Persistence

PostgreSQL is the authoritative store for accounts, catalogue commerce, purchases, entitlements, financial facts, referrals, authorization, and operations.

The blog is intentionally isolated in SQLite and defaults in Docker to `/workspace/data/blog/blog.sqlite`, persisted by the `blog-data` volume. Blog content is not stored in PostgreSQL.

Wallet, earnings, and company treasury balances are projections over append-only financial facts; mutable balance fields are not authoritative accounting state.

## Commerce and access

Public catalogue discovery does not require authentication. Purchasing creates a single-listing checkout paid from available internal funds. A completed purchase creates an entitlement independently from referral distribution consequences.

Canonical access uses `/access/{purchaseId}`. The platform verifies ownership and entitlement state, then hands off to the configured destination. Where required, the destination receives an opaque random `source` credential resolved server-side; it is not JWT/JWE and contains no business data.

## Catalogue ownership

Ordinary accounts do not create commercial listings. Catalogue management is restricted to operator/admin users and accounts granted the `catalogue_manager` capability. Historical seller-oriented fields may remain for compatibility/audit but are not seller/payee semantics for new commerce.

Listing lifecycle, media storage, and JSON/CSV/YAML transfer are documented in [Listing Management and Media](docs/listing-management-and-media.md).

## Authentication and API

Better Auth handles authentication. Cliqero's canonical account remains the domain/economic identity. Application APIs are routed through Hono and use either authenticated browser sessions or scoped database-backed API keys.

See [Authentication](docs/authentication.md) and [API Foundation](docs/api-foundation.md).

## Referral distribution

Authenticated accounts may promote eligible listings through attributed links. Referral earnings are consequences of qualifying completed purchases. They are recorded in the earnings ledger, mature according to policy, and may later become withdrawable. Missing configured uplines are not redistributed; their share remains with the platform.

Referral commission policy is provider-independent and loaded from `config/hierarchy/distribution.yaml`.

## Structure

- `apps/web` — Next.js application and modular-monolith capabilities
- `database/migrations` — PostgreSQL capability-owned schemas and kernel infrastructure
- `services/*/compose*.yaml` — service-owned Compose definitions
- `compose*.yaml` — root composition
- `config/` — platform/capability/provider configuration and examples
- `docs/` — product, architecture, operations, and API documentation

## Documentation

Start with [docs/README.md](docs/README.md). It distinguishes current authoritative behavior from historical terminology retained only for migration or filename stability.
