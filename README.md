# Cliqero

Cliqero is a productless commerce and referral platform built around:

> List → Refer → Buy → Access

The authoritative product and architecture specification is [docs/README.md](docs/README.md).

## Development

Requirements: Node.js 22+, npm 11+, Docker Engine, and Docker Compose with `include` support.

```bash
npm ci
npm test
npm run typecheck
npm run dev
```

Run the application and PostgreSQL together with:

```bash
docker compose up --build
```

The web application is available at `http://localhost:3000`; its health endpoint is `/api/health`.

The outbox dispatcher runs as the independently scalable `outbox-worker` Compose service. Paystack is disabled unless
`config/modules/payment/paystack.yaml` and `config/secrets/payment/paystack.yaml` are provided to both the web and worker
containers. The tracked example files document their shape; real secret files are ignored and excluded from Docker images.

Run the worker outside Docker with `npm run worker:outbox`. It consumes the same `DATABASE_URL` as the web application
and shuts down cleanly on `SIGTERM` or `SIGINT`.

## Referral attribution

Listing referral URLs use `/r/<opaque-code>`. A valid visit creates a new 30-day attribution credential and replaces the
HttpOnly `cliqero_attribution` cookie, so the deterministic rule is last valid referral-link visit wins. Only a credential
issued by that route can resolve attribution; checkout hashes the cookie value and resolves its listing/link/referrer scope
server-side. Purchases snapshot the resolved attribution, link, and referrer IDs. Raw attribution credentials are not stored.

## Financial distribution

The outbox worker consumes `purchase.completed` and atomically writes one immutable purchase distribution, its seller,
referral, and platform ledger credits, and a `purchase.distribution.completed` outbox fact. Active rates live in
`referral_capability.commission_policy` and `ledger_capability.distribution_policy` as integer basis points. Percentage
results are floored in minor units and the configured seller/platform remainder recipient receives the residual, so every
distribution exactly conserves the immutable purchase gross. Paystack-reported fees are retained for audit but remain
informational in V1 and do not silently change recipient economics.

Operator capability is granted through `identity_capability.account_capabilities`, never through request parameters.
Authorized operators can inspect sanitized Paystack event/payment/outbox state at `GET /api/operator/paystack/events`, list
eligible pending payments with `GET /api/operator/paystack/reconcile`, and trigger idempotent authoritative verification with
`POST /api/operator/paystack/reconcile` plus an `Idempotency-Key` header. Reconciliation always enters the existing payment
completion workflow; it never creates purchases, entitlements, or ledger entries directly.

## Structure

- `apps/web` — current Next.js application and modular-monolith capabilities;
- `database/migrations` — PostgreSQL capability-owned schemas and kernel infrastructure;
- `services/*/compose*.yaml` — service-owned production/development definitions;
- `compose*.yaml` — root composition only;
- `config/modules` — non-secret provider configuration examples;
- `config/secrets` — ignored secret configuration (examples remain tracked).
