default: help

# Show available development, production, and application commands
help:
	@just --list

# Start the development Compose stack (automatically includes compose.override.yaml)
dev:
	docker compose up -d

# Rebuild and start the development Compose stack
dev-build:
	docker compose up -d --build

# Stop the development stack without deleting volumes
dev-down:
	docker compose down

# Destructive: stop the development stack and delete local volumes
dev-clean:
	docker compose down -v --remove-orphans

# Follow development service logs
dev-logs:
	docker compose logs -f

# Show development service status
dev-ps:
	docker compose ps

# Restart the development Compose stack
dev-restart:
	docker compose restart

# Start the production Compose stack using compose.yaml only
prod:
	docker compose -f compose.yaml up -d

# Rebuild and start the production Compose stack
prod-build:
	docker compose -f compose.yaml up -d --build

# Stop the production Compose stack without deleting volumes
prod-down:
	docker compose -f compose.yaml down

# Follow production service logs
prod-logs:
	docker compose -f compose.yaml logs -f

# Show production service status
prod-ps:
	docker compose -f compose.yaml ps

# Restart the production Compose stack
prod-restart:
	docker compose -f compose.yaml restart

# Open a shell in the development main container
shell:
	docker compose exec main sh

# Open a shell in the development outbox worker
worker-shell:
	docker compose exec outbox-worker sh

# Open psql in the development PostgreSQL container
db-shell:
	docker compose exec postgres psql -U "$${POSTGRES_USER:-cliqero}" -d "$${POSTGRES_DB:-cliqero}"

# Run the web application's full test command
test:
	npm test --workspace @cliqero/web

# Run non-integration unit tests
test-unit:
	APP_URL=http://localhost:3000 npm test --workspace @cliqero/web -- --exclude src/integration/**

# Run the complete PostgreSQL integration suite
test-integration:
	TEST_DATABASE_URL="$${TEST_DATABASE_URL:-postgresql://cliqero:cliqero-local@localhost:5432/cliqero}" APP_URL=http://localhost:3000 BLOG_DATABASE_PATH=/tmp/cliqero-blog-integration.sqlite npm run test:integration --workspace @cliqero/web -- --no-file-parallelism

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

# Initialize/apply migrations to the isolated blog SQLite database
blog-migrate:
	npm run blog:migrate --workspace @cliqero/web

# Run the application console (for example: just cli --help)
cli *args:
	npm run cli --workspace @cliqero/web -- {{args}}

# Seed development-only catalogue fixtures (never run in production)
seed-catalogue:
	docker compose exec -T main sh -lc 'NODE_ENV=development npm run seed:catalogue --workspace @cliqero/web'

# Seed development-only SQLite blog fixtures (never run in production)
seed-blog:
	docker compose exec -T main sh -lc 'NODE_ENV=development npm run seed:blog --workspace @cliqero/web'

# Seed all development fixtures
seed: seed-catalogue seed-blog

# Validate the development Compose configuration
compose-dev-config:
	docker compose config

# Validate compose.yaml without the development override
compose-prod-config:
	docker compose -f compose.yaml config
