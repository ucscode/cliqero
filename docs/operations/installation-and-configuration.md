# Installation and Configuration

[Back to documentation index](../README.md)

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

Development uses the Compose override, live source mounts, worker source/config
watching, and a disposable `.next` volume. Dependencies remain the trees
installed in the Docker image; host `node_modules` is not mounted over them.
Ordinary TypeScript and YAML changes therefore do not require a worker image
rebuild. Recreate the development stack after `.env` or Compose environment
changes; rebuild only for dependency, Dockerfile, base-image, or OS-layer
changes.

Before relying on worker runtime behavior, verify both service health and recent
worker output:

```bash
docker compose ps
docker logs --tail=100 cliqero-outbox-worker-1
```

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

Copy `.env.example` to `.env` and review every value before non-local deployment. Important bootstrap values include application URL, PostgreSQL credentials/connection values, the Better Auth secret and authentication configuration, application port, and blog database path. See [Environment variables](./environment-variables.md) for the complete runtime reference, including worker, cache, logging, and testing settings that are intentionally not all placed in `.env.example`.

Do not reuse development secrets in production.

The Docker blog database path is `/workspace/data/blog/blog.sqlite` and is persisted through the `blog-data` named volume.

## YAML configuration

Provider/capability configuration lives under `config/`. Real `*.yaml` and `*.yml` files are ignored while `*.example.yaml`/`*.example.yml` templates are tracked.

A provider is configured by copying the relevant example and supplying local credentials/settings. Do not commit real provider secrets.

### Portable local configuration bundles

Create an ignored, editable copy of every tracked configuration example with:

```bash
npm run config:local -- workstation
```

This creates `local.workstation/` as a miniature project-root configuration tree. For example, `.env.example` becomes `.env`, and `config/security/auth.example.yaml` becomes `config/security/auth.yaml` within the bundle. The generator discovers examples recursively, so new `*.example.yaml` and `*.example.yml` files are included automatically.

Bundles copy **only** tracked examples; they never copy `.env` or real YAML files and therefore never harvest local secrets. Git ignores `local.*`. Existing bundles are protected from overwrite; use `--force` only when deliberately replacing a generated bundle.

Suggested workflow: generate a named bundle, edit values in that ignored directory, then use its preserved relative paths while preparing configuration for another checkout or deployment. The generator does not sync a bundle into the project root.

The platform media registry is configured in
`config/storage/media.yaml`; initialize a local filesystem setup with:

```bash
mkdir -p config/storage
cp config/storage/media.example.yaml config/storage/media.yaml
```

The default Docker filesystem root is `/var/lib/cliqero/media` and is persisted
by the `media-data` volume. Listing media is one consumer of this shared
registry. The real media YAML is required at runtime and remains ignored.

Every Cliqero configuration YAML uses `parameters` as its document envelope.
`imports` is optional and is declared only when that file imports other
configuration. The parameters mapping holds the ordinary configuration object
consumed by the existing domain loader:

```yaml
parameters:
  callback_url: "%env(APP_URL)%/some/provider/callback"
```

Missing `imports`, `imports:`, `imports: null`, and `imports: []` all normalize
to an empty list. Empty `parameters` (`parameters:`, `null`, or `{}`) normalizes
to an empty mapping. Configuration values written directly at the document
root are invalid. Domain schemas continue receiving the effective parameters
object and do not need to know about the envelope.

Use imports only to split one complex configuration when useful; they do not
create a global configuration tree, and existing independently owned config
files should remain independent. Imports may be recursive, and each explicit
YAML path resolves relative to the file that declares it. Globs, directories,
and URLs are not supported. Missing imported files and circular imports are
configuration errors.

Composition order is imports in listed order, followed by the importing file's
own `parameters`. Mappings deep-merge recursively, arrays concatenate in order,
and later scalar values replace earlier ones. Thus the importing file wins
conflicts. `null` inside `parameters` remains a real value; only the envelope
fields receive empty-value normalization.

For example, a large bank-transfer configuration can import account fragments
without changing the final object shape accepted by the bank-transfer loader:

```yaml
imports:
  - ./bank_transfer/nigeria-uba.yaml
  - ./bank_transfer/us-first.yaml

parameters:
  enabled: true
  display_name: Bank transfer
  filters:
    countries:
      - NG
      - US
  config:
    instruction: Use the funding reference as narration.
```

Each account fragment has the same envelope and can contribute to the
`config.accounts` array. Splitting is optional; examples are kept together for
easy local setup.

YAML may reference an environment value explicitly inside `parameters`:

```yaml
parameters:
  callback_url: "%env(APP_URL)%/some/provider/callback"
```

The loader composes raw values before placeholder resolution. Existing lazy
provider behavior is preserved: disabled providers can be inspected without
resolving their imported secrets. Direct `loadYamlConfiguration()` consumers
resolve recursively after composition. Missing referenced variables fail with
configuration context. `%%env(NAME)%%` escapes a placeholder when literal text
is required.

## Payment providers

External payment providers are incoming-funding adapters. They add verified funds to the buyer's internal account value; they do not purchase listings or create entitlements directly.

Inbound payment-provider implementations and configuration are optional/removable. Outbound withdrawal payments are sent outside Cliqero and require no provider configuration. Withdrawal eligibility and amount boundaries are required in `config/modules/withdrawal/policy.yaml`; copy `policy.example.yaml` through the local configuration workflow. During development, the canonical baseline no longer creates a withdrawal policy table, so existing local databases must be reset and bootstrapped from `database/migrations/001_initial_schema.sql`.

Use YAML block-style sequences and mappings. Avoid flow-style collections in maintained configuration files.

Payment-module examples use the same top-level eligibility shape:

```yaml
parameters:
  enabled: true
  display_name: Provider name
  image_url: /images/payment/provider.svg
  description: Provider description.
  filters:
    countries: null
  config:
    # Provider-specific settings belong here.
```

`filters.countries` gates provider visibility for the authenticated customer's
country only; it does not filter currencies or invoke country-currency
mapping. Bank transfer applies its separate `accounts[].filters.countries`
after the provider-level filter to choose receiving accounts. `countries: null`
means unrestricted visibility.

## Referral policy

Referral distribution is configured independently from payment providers in `config/hierarchy/distribution.yaml`.

Conceptually:

```yaml
parameters:
  distribution:
    platform:
      percentage: 10
    commission:
      levels:
        1: 50
        2: 30
        3: 10
```

Percentages are integer percentages, not basis points. The platform percentage plus all configured level percentages must not exceed 100. Level keys are positive integers and may be sparse; YAML ordering has no economic meaning. `levels: null` and `levels: {}` deliberately mean no referral allocations, and the seller receives the remaining configured share. A configured level without an actual upline is allocated to the platform.

## Persistence

PostgreSQL stores the commercial/accounting/identity domain. The blog uses a separate SQLite database and must remain isolated from PostgreSQL.

## PostgreSQL initialization

An empty PostgreSQL volume is initialized directly from the single canonical
`database/migrations/001_initial_schema.sql` file mounted by Compose. The
development database is intentionally resettable before launch; recreating the
PostgreSQL volume applies this baseline without replaying historical migration
steps. Blog content has its own independent SQLite migration under the web
application and is never part of this PostgreSQL bootstrap.

During active development, while destructive database reset is acceptable,
schema changes must be folded into `database/migrations/001_initial_schema.sql`.
Do not add numbered incremental migrations. Start preserving incremental
migration history only when the project reaches a stage where existing deployed
database state must be upgraded non-destructively.

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
