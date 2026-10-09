default: help

# Show available development, production, and application commands
help:
	@just --list

# Start the development Compose stack (automatically includes compose.override.yaml).
# The web app and outbox worker use live source mounts; ordinary TypeScript/YAML
# changes do not require an image rebuild.
dev:
	docker compose up -d

# Rebuild and start the development Compose stack. Use only after Dockerfile,
# base-image, OS-package, or development image-build changes. Dependency changes
# use `just dev-deps` / `just dev-npm-add` and do not require an image build.
dev-build:
	docker compose up -d --build

# Stop the development stack without deleting volumes
dev-down:
	docker compose down

# Destructive: remove every volume owned by the development Compose project,
# including PostgreSQL, Blog, media, Next output, dependencies, and Mailpit.
# Production recipes use a separate Compose project and are not affected.
dev-clean:
	docker compose down --volumes --remove-orphans

# Destructive: reset development PostgreSQL only, then restart the app/worker.
# Startup re-applies database/migrations/001_initial_schema.sql to empty PGDATA.
dev-db-reset:
	docker compose stop main outbox-worker postgres
	docker compose run --rm --no-deps --entrypoint sh postgres -ec 'find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
	docker compose up -d postgres main outbox-worker

# Non-destructively apply supported additive tables, columns, indexes, constraints, and triggers
# from the canonical baseline. Refuses incompatible or destructive drift.
dev-db-sync:
	node scripts/dev-database-sync.mjs

# Explicitly reconcile only the reviewed legacy constraint definitions, then
# require the normal strict schema sync to prove the database matches 001.
dev-db-reconcile-known-drift:
	node scripts/dev-database-sync.mjs --reconcile-known-drift

# Unit tests for the development database schema-sync planner
dev-db-sync-test:
	node --test scripts/dev-database-sync.test.mjs

# Read-only OpenAPI and public HTTP-surface audit; does not create application data.
api-surface-audit:
	node scripts/audit-http-surface.mjs

# Destructive: reset development Blog SQLite only, including WAL/SHM, then
# restart the web app. PostgreSQL, media, and dependency volumes are untouched.
dev-blog-reset:
	docker compose stop main
	docker compose run --rm --no-deps --entrypoint sh main -ec 'rm -f /workspace/data/blog/blog.sqlite /workspace/data/blog/blog.sqlite-wal /workspace/data/blog/blog.sqlite-shm'
	docker compose up -d main

# Destructive: remove only the named development dependency volumes.
dev-deps-clean:
	docker compose rm --stop --force main outbox-worker
	docker volume ls -q --filter label=com.docker.compose.project=cliqero --filter label=com.docker.compose.volume=cliqero-node-modules | xargs -r docker volume rm
	docker volume ls -q --filter label=com.docker.compose.project=cliqero --filter label=com.docker.compose.volume=cliqero-web-node-modules | xargs -r docker volume rm
	docker volume ls -q --filter label=com.docker.compose.project=cliqero --filter label=com.docker.compose.volume=outbox-worker-node-modules | xargs -r docker volume rm
	docker volume ls -q --filter label=com.docker.compose.project=cliqero --filter label=com.docker.compose.volume=outbox-worker-web-node-modules | xargs -r docker volume rm

# Add/remove npm dependencies in the Linux development container without a build.
dev-npm-add package workspace="@cliqero/web":
	docker compose stop main outbox-worker
	docker compose run --rm --no-deps main npm install {{package}} --workspace {{workspace}}
	docker compose run --rm --no-deps outbox-worker npm ci
	docker compose up -d --no-build main outbox-worker

dev-npm-remove package workspace="@cliqero/web":
	docker compose stop main outbox-worker
	docker compose run --rm --no-deps main npm uninstall {{package}} --workspace {{workspace}}
	docker compose run --rm --no-deps outbox-worker npm ci
	docker compose up -d --no-build main outbox-worker

# Follow development service logs
dev-logs:
	docker compose logs -f

# Follow application diagnostics written by the development server
dev-diagnostics:
	@mkdir -p var/log
	tail -F var/log/development.log

# Show development service status
dev-ps:
	docker compose ps

# Restart the development Compose stack
dev-restart:
	docker compose up -d --no-build --force-recreate

# Start production from the canonical base without development overrides
prod:
	docker compose -p cliqero-prod -f compose.yaml up -d

# Rebuild and start the production Compose stack
prod-build:
	docker compose -p cliqero-prod -f compose.yaml up -d --build

# Stop the production Compose stack without deleting volumes
prod-down:
	docker compose -p cliqero-prod -f compose.yaml down

# Follow production service logs
prod-logs:
	docker compose -p cliqero-prod -f compose.yaml logs -f

# Show production service status
prod-ps:
	docker compose -p cliqero-prod -f compose.yaml ps

# Restart the production Compose stack
prod-restart:
	docker compose -p cliqero-prod -f compose.yaml restart

# Open a shell in the development main container
dev-shell:
	docker compose exec main sh

# Open a shell in the development outbox worker
dev-worker-shell:
	docker compose exec outbox-worker sh

# Open psql in the development PostgreSQL container
dev-db-shell:
	docker compose exec postgres psql -U "$${POSTGRES_USER:-cliqero}" -d "$${POSTGRES_DB:-cliqero}"

# Run npm inside the development main container
dev-npm *args:
	docker compose exec main npm {{args}}

# Reconcile persisted development dependencies exactly with package-lock.json
# Useful after pulling dependency changes or when node_modules gets out of sync.
dev-deps:
	docker compose stop main outbox-worker
	docker compose run --rm --no-deps main npm ci
	docker compose run --rm --no-deps outbox-worker npm ci
	docker compose up -d --no-build main outbox-worker

# Run the web application's full test command
test:
	npm test --workspace @cliqero/web

# Run non-integration unit tests
test-unit:
	APP_URL=http://localhost:3000 npm test --workspace @cliqero/web -- --exclude src/integration/**

# Reset the disposable local integration database from the canonical schema baseline
test-db-reset:
	node scripts/test-database.mjs reset

# Run PostgreSQL integration tests; provisions cliqero_test locally unless overridden
test-integration:
	node scripts/test-database.mjs integration

# Run TypeScript checks
typecheck:
	npm run typecheck

# Run ESLint
lint:
	npm run lint

# Format supported repository files
format:
	npm run format

# Check repository formatting
format-check:
	npm run format:check

# Build the production web application with webpack
build:
	npm run build --workspace @cliqero/web -- --webpack

# Initialize/apply migrations to the Blog SQLite database selected by
# BLOG_DATABASE_PATH (or the app's default path).
blog-migrate:
	npm run blog:migrate --workspace @cliqero/web

# Run the application console inside the development main container.
# Keeping this command in Compose gives it the same Node dependencies and
# DATABASE_URL as the running application. TTY is intentionally preserved for
# hidden password prompts.
dev-cli *args:
	docker compose exec main npm run cli --workspace @cliqero/web -- {{args}}

# Seed development-only catalogue fixtures (never run in production)
dev-seed-catalogue:
	docker compose exec -T main sh -lc 'NODE_ENV=development npm run seed:catalogue --workspace @cliqero/web'

# Seed development-only authenticatable referral users (never run in production)
dev-seed-users:
	docker compose exec -T main sh -lc 'NODE_ENV=development npm run seed:users --workspace @cliqero/web'

# Seed development-only SQLite blog fixtures (never run in production)
dev-seed-blog:
	docker compose exec -T main sh -lc 'NODE_ENV=development npm run seed:blog --workspace @cliqero/web'

# Seed all development fixtures
dev-seed: dev-seed-users dev-seed-catalogue dev-seed-blog

# Create a real checkout-backed development purchase and print its persisted earnings distribution
dev-distribution buyer="central_left_1" listing="":
	docker compose exec -T -w /workspace/apps/web main node --import tsx src/infrastructure/development/distribution-scenario.ts {{quote(buyer)}} {{quote(listing)}}

# Validate the development Compose configuration
dev-compose-config:
	docker compose config

# Validate compose.yaml without the development override
prod-compose-config:
	docker compose -p cliqero-prod -f compose.yaml config

# Back up PostgreSQL, Blog SQLite, and filesystem media after stopping known writers.
# Supply the exact quiescence confirmation and store artifacts outside this checkout.
backup output="../cliqero-backups" confirm="":
	node scripts/operations/backup.mjs --output {{quote(output)}} --confirm-quiescence {{quote(confirm)}}

# Production backup is deliberately explicit and is never used by development validation.
backup-prod output="../cliqero-backups" confirm="" production_confirm="":
	node scripts/operations/backup.mjs --production --output {{quote(output)}} --confirm-quiescence {{quote(confirm)}} --confirm-production {{quote(production_confirm)}}

# Verify manifest hashes, the SQLite database, media archive, and PostgreSQL dump.
backup-verify directory environment="development":
	node scripts/operations/verify-backup.mjs {{quote(directory)}} --environment {{quote(environment)}}
