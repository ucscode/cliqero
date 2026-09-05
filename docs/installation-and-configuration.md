# Installation and Configuration

[Back to documentation index](./README.md)

## Requirements

For the Docker-first workflow install:

- Docker Engine
- Docker Compose with `include` support
- `just`
- Git

Node.js 22+ and npm 11+ are required when running repository tooling directly on the host. Docker images install workspace dependencies with `npm ci` from the committed lockfile.

## First development start

```bash
git clone <repository-url>
cd cliqero
cp .env.example .env
just dev-build
```

Check the stack:

```bash
just dev-ps
just dev-logs
```

The application listens on `http://localhost:3000` by default. Health is available at `/api/health`.

After the images have been built, ordinary development startup is:

```bash
just dev
```

Development uses the Compose override, source hot reload, and a disposable `.next` volume. Dependencies remain the tree installed in the Docker image; `node_modules` is not masked by anonymous runtime volumes.

## Production-like local start

```bash
just prod-build
```

Production recipes explicitly use `docker compose -f compose.yaml`, so the development override is not loaded. The main production image is `cliqero-main-prod`; development is `cliqero-main-dev`. The distinct identities prevent cross-mode image reuse.

Subsequent starts can use:

```bash
just prod
```

## Environment file

Copy `.env.example` to `.env` and review every value before non-local deployment. Important bootstrap values include application URL, PostgreSQL credentials/connection values, Better Auth URL/secret, application port, and blog database path.

Do not reuse development secrets in production.

The Docker blog database path is `/workspace/data/blog/blog.sqlite` and is persisted through the `blog-data` named volume.

## YAML configuration

Provider/capability configuration lives under `config/`. Real `*.yaml` and `*.yml` files are ignored while `*.example.yaml`/`*.example.yml` templates are tracked.

A provider is configured by copying the relevant example and supplying local credentials/settings. Do not commit real provider secrets.

The platform media registry is configured in
`config/storage/media.yaml`; initialize a local filesystem setup with:

```bash
mkdir -p config/storage
cp config/storage/media.example.yaml config/storage/media.yaml
```

The default Docker filesystem root is `/var/lib/cliqero/media` and is persisted
by the `media-data` volume. Listing media is one consumer of this shared
registry. The real media YAML is required at runtime and remains ignored.

YAML may reference an environment value explicitly:

```yaml
callback_url: "%env(APP_URL)%/some/provider/callback"
```

Resolution is recursive. Missing referenced variables fail with configuration context. `%%env(NAME)%%` escapes a placeholder when literal text is required.

## Payment providers

External payment providers are incoming-funding adapters. They add verified funds to the buyer's internal account value; they do not purchase listings or create entitlements directly.

Provider implementations and configuration are optional/removable. Payment-provider configuration is independent from payout-provider configuration even when the same external company supports both capabilities.

## Referral policy

Referral distribution is configured independently from payment providers in `config/hierarchy/distribution.yaml`.

Conceptually:

```yaml
distribution:
  commission:
    levels:
      1: 50
      2: 30
      3: 10
```

Percentages are integer percentages, not basis points. Levels are contiguous from 1 and their total must not exceed 100. `levels: null` and `levels: {}` deliberately mean no referral commissions.

## Persistence

PostgreSQL stores the commercial/accounting/identity domain. The blog uses a separate SQLite database and must remain isolated from PostgreSQL.

Normal `just dev-down` / `just prod-down` stops containers without deleting persistent volumes. `just dev-clean` runs volume removal and is destructive.

## Blog initialization

Apply/initialize the isolated blog schema with:

```bash
just blog-migrate
```

## Repository checks

```bash
just test
just test-unit
just test-integration
just typecheck
just lint
just format-check
just build
```

The PostgreSQL integration suite is intentionally run without file parallelism because shared integration fixtures are not safe for parallel truncation.

## Useful container access

```bash
just shell
just worker-shell
just db-shell
```

## Configuration boundaries

Keep these boundaries intact:

- environment variables: deployment/bootstrap values;
- YAML: provider/capability/static policy configuration;
- PostgreSQL: commercial/accounting/identity/runtime facts;
- SQLite: blog content;
- browser/API authorization: Better Auth sessions or scoped API keys resolved to a canonical Cliqero principal.

Do not move provider-specific business configuration into environment variables merely for convenience, and do not place blog content into PostgreSQL.
