# Contributor checks

Use the repository formatter and quality checks before considering TypeScript or
Next.js changes complete:

```bash
npm run format
npm run lint
npm run typecheck
```

Use `npm run format:check` in CI or when verifying a clean formatting diff.
Prettier is authoritative for formatting; ESLint supplies code-quality rules and
must not reformat code independently. Keep generated, vendor, build, and local
credential/configuration files out of formatting and lint runs.

## Local worker development

The development `outbox-worker` uses a live repository source mount and keeps
its dependencies in Docker-owned anonymous volumes. Ordinary worker
TypeScript and YAML configuration changes do not require
`docker compose build outbox-worker`; the worker watch command restarts the
process for changes under `apps/web/src` and `config/`. Changes to `.env` or
Compose environment values require recreating the service, for example with
`just dev-restart`, but still do not require an image rebuild.

Rebuild only when package dependencies, the Dockerfile, the base image, or OS
packages change. Before claiming worker runtime verification passed, check:

```bash
docker compose ps
docker logs --tail=100 cliqero-outbox-worker-1
```

Before implementing frontend UI, prefer the established component library and
Tailwind utilities. Do not create custom generic UI primitives or large custom
CSS systems when an existing project dependency solves the problem.

## Development database migrations

During active development, while destructive database reset is acceptable,
schema changes must be folded into `database/migrations/001_initial_schema.sql`.
Do not add numbered incremental migrations. Start preserving incremental
migration history only when the project reaches a stage where existing deployed
database state must be upgraded non-destructively.

Before implementing frontend UI, prefer the established component library and
Tailwind utilities. Do not create custom generic UI primitives or large custom
CSS systems when an existing project dependency solves the problem.
