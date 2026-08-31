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

### YAML environment references

Capability-local YAML files may reference shared deployment values with `%env(NAME)%`. Substitution is recursive through
objects and arrays, and missing variables fail with the variable name and configuration path. YAML remains authoritative:
environment variables are read only where a placeholder is written. For example:

```yaml
callback_url: "%env(APP_URL)%/payments/paystack/callback"
```

Use `%%env(NAME)%%` when the literal placeholder text is required. `APP_URL` is the canonical application URL for shared
URL composition; provider-specific settings and credentials remain in their capability YAML files.

### Configuration hierarchy

1. Platform-wide deployment values belong in `.env` (for example `APP_URL` and PostgreSQL settings).
2. Provider-specific values belong in `config/modules/<capability>/<provider>.yaml`; hierarchy policies belong in `config/hierarchy/`.
3. Tracked `*.example.yaml` files are safe templates; real provider YAML files are local and ignored by
   `config/.gitignore`.
4. YAML may explicitly reference shared environment values with `%env(NAME)%`; environment variables never implicitly
   override YAML values.

The outbox dispatcher and commercial state processors run in the `outbox-worker` Compose service. External payment
providers fund wallets; they never purchase listings. `POST /api/checkout` creates a wallet-paid, single-listing checkout
and never accepts a provider. See [the wallet-first workflow](docs/wallet-first-commerce.md) and the
[verified API matrix](docs/public-api-matrix.md).

Listing lifecycle, provider-neutral media storage, and JSON/CSV/YAML transfer formats are documented in
[listing management and media](docs/listing-management-and-media.md). New listings are drafts; publishing, archival, and
restoration are explicit commands. Public listing projections never expose private destinations.

Paystack payment capability is enabled only when `config/modules/payment/paystack.yaml` exists with `enabled: true` and
valid credentials. It is an incoming-funding adapter. Real provider configuration files are ignored and excluded from
Docker images.

Provider implementations are grouped under `apps/web/src/providers/<provider>/`; capability modules contain only
provider-neutral contracts and orchestration. Paystack payment and payout configuration remain separate files, so either
capability can be disabled independently. The payment registry evaluates `filters` against the provider's collection
currency for wallet funding. Listing commerce and all internal accounting remain canonical USD.

Exchange-rate contracts live with the money capability. Rates are represented as decimal strings and conversion uses
integer arithmetic with explicit rounding. Funding snapshots its canonical USD and provider collection facts once; wallet
checkout never performs FX.

Run the worker outside Docker with `npm run worker:outbox`. It consumes the same `DATABASE_URL` as the web application
and shuts down cleanly on `SIGTERM` or `SIGINT`.

## Referral attribution

Listing referral URLs use `/r/<opaque-code>`. A valid visit creates a new 30-day attribution credential and replaces the
HttpOnly `cliqero_attribution` cookie, so the deterministic rule is last valid referral-link visit wins. Only a credential
issued by that route can resolve attribution; checkout hashes the cookie value and resolves its listing/link/referrer scope
server-side. Purchases snapshot the resolved attribution, link, and referrer IDs. Raw attribution credentials are not stored.

## Financial distribution

The outbox worker consumes `purchase.completed` and atomically writes one immutable purchase distribution with referral
credits and a platform remainder. New wallet purchases read validated percentage levels from
`config/hierarchy/distribution.yaml`; missing upline levels remain with the platform and no seller credit is created.
Amounts are canonical USD bigint cents and every distribution stores the applied policy snapshot. A separate treasury
processor converts each platform allocation into one append-only treasury credit; operator expenses are append-only
debits and corrections are compensating entries. Wallet, earnings, and treasury balances are projections over separate
financial facts.

Operator capability is granted through `identity_capability.account_capabilities`, never through request parameters.
Authorized operators can inspect sanitized Paystack event/payment/outbox state at `GET /api/operator/paystack/events`, list
eligible pending payments with `GET /api/operator/paystack/reconcile`, and trigger idempotent authoritative verification with
`POST /api/operator/paystack/reconcile` plus an `Idempotency-Key` header. Reconciliation always enters the existing payment
completion workflow; it never creates purchases, entitlements, or ledger entries directly.

## Settlement and corrections

Distribution credits use the persisted settlement policy. Pending credits mature through append-only
`ledger_capability.entry_settlements` records; original ledger rows are never changed. A confirmed full reversal creates
new debit entries linked to each original entry and emits `purchase.reversal.completed`; the outbox entitlement consumer then
revokes the related entitlement. Paystack `refund.processed` events are authenticated, require a full amount/currency match,
and enter this same correction workflow. Partial refunds and automatic chargeback consequences remain deferred.

## Withdrawals

Withdrawals reserve only currently available ledger earnings. The request transaction serializes per account in PostgreSQL,
creates an immutable reservation fact, and emits `withdrawal.requested`; pending earnings cannot be reserved. Operators can
approve, reject (releasing the reservation), or manually complete an approved request through the operator routes. Release
and completion are append-only reservation events, and the withdrawal state never rewrites its original owner, amount,
currency, or destination. Payout-provider execution remains behind the `PayoutProvider` registry contract and is deferred.

Approved withdrawals can be handed to the provider-neutral payout execution processor through the operator payout route.
Payout executions persist one stable execution identity plus append-only attempts. Retryable failures retain the reservation
with bounded backoff; permanent failures remain reserved for operator action; unknown outcomes require provider verification
before another submission. Successful verified execution consumes the reservation and completes the withdrawal atomically.
The development provider supports deterministic success, retryable, permanent, and unknown-then-verified outcomes. Paystack
Transfers are an optional provider: enable them independently with `config/modules/payout/paystack.yaml` containing
`enabled: true` and a valid secret. Payment enablement does not enable payouts.

Paystack payout execution supports Nigerian NUBAN destinations, creates/reuses a recipient, submits exact NGN kobo amounts
with the stable Cliqero reference, and treats queued transfers as pending until `transfer.success` or verification confirms
success. `transfer.failed` is recorded without releasing the reservation. Configure the Paystack dashboard webhook to point
at `/api/webhooks/paystack`; transfer events use the same raw-body HMAC-SHA512 authentication as payment events. Optional
sandbox smoke tests require Paystack test credentials and a configured transfer-enabled test account; test mode may not
produce a complete bank lifecycle, so webhook/reconciliation completion must be verified where available.

## Structure

- `apps/web` — current Next.js application and modular-monolith capabilities;
- `database/migrations` — PostgreSQL capability-owned schemas and kernel infrastructure;
- `services/*/compose*.yaml` — service-owned production/development definitions;
- `compose*.yaml` — root composition only;
- `config/modules` — capability-local provider configuration and tracked examples; real YAML files are ignored by
  `config/.gitignore`.
