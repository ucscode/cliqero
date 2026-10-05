# Resource API audit

This inventory records the application API exposed by the Hono router and its
internal compatibility dispatch registry after resource-route normalization.
The compatibility modules are not a second business API: Hono performs
principal resolution and dispatches them after route matching.

## Scope and counts

The audit inspects every operation in the generated Hono/OpenAPI surface,
including compatibility-dispatch routes after deduplicating shared paths.
Better Auth, media/navigation routes, and provider callbacks are inspected
separately as protocol or framework boundaries.

The withdrawal normalization completed in this change has these decisions:

| Previous route                                  | Canonical route                                                                                    | Decision                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `DELETE /api/withdrawals/{withdrawalId}`        | `PATCH /api/withdrawals/{withdrawalId}` with `{ status: "cancelled" }`                             | NORMALIZE; cancellation retains the record |
| `POST /api/withdrawals/{withdrawalId}/approve`  | `PATCH /api/withdrawals/{withdrawalId}` with `{ status: "approved" }`                              | REMOVE/REPLACE                             |
| `POST /api/withdrawals/{withdrawalId}/reject`   | `PATCH /api/withdrawals/{withdrawalId}` with `{ status: "rejected", reason }`                      | REMOVE/REPLACE                             |
| `POST /api/withdrawals/{withdrawalId}/complete` | `PATCH /api/withdrawals/{withdrawalId}` with `{ status: "completed", external_reference?, note? }` | REMOVE/REPLACE                             |

The old operator state routes and automatic payout execution/reconciliation
routes are no longer registered or represented in OpenAPI. Withdrawal
completion records a payment already sent outside Cliqero.

## Access model

| Access mode              | Meaning                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `anonymous`              | Public read or explicitly anonymous identity/password operation; API-key access is rejected where the operation is browser-only.           |
| `account`                | The principal's own Cliqero account, resolved from the session or API-key owner. API keys additionally require the route's declared scope. |
| `session_only`           | Interactive Better Auth session is required; API keys cannot substitute for browser identity operations.                                   |
| `integration_credential` | Provider/listing integration credential is the protocol credential.                                                                        |
| `provider_signature`     | External provider webhook/callback authentication, not a CRUD resource.                                                                    |
| `operator`               | The owning account must have the required capability; an API-key principal also needs the matching operator scope.                         |

Account-owned APIs never accept an arbitrary account id from the caller. In
particular, `GET /api/wallet/transactions` resolves the account from the
principal, requires `wallet:read` for an API-key principal, returns `401` with
no principal, and returns `403` for a key without that scope.

## Compatibility path inventory

The following is the complete compatibility registry inventory. Methods are
the methods exported by the registered module; access is the route's declared
principal boundary. `KEEP` means the current noun or protocol shape is sound;
`LEGACY DEBT` means the path is recorded for a later focused normalization and
was not changed by the withdrawal-only implementation in this audit.

| Methods           | Current path                                                     | Resource/owner                      | Access                              | Classification / decision                                          |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| POST              | `/api/access/verify`                                             | access/integration                  | integration credential              | PROTOCOL EXCEPTION / KEEP                                          |
| POST              | `/api/accounts`                                                  | account creation                    | anonymous                           | KEEP                                                               |
| POST              | `/api/checkouts/{checkoutId}/pay`                                | checkout payment                    | account                             | TRUE CHECKOUT COMMAND                                              |
| GET, POST         | `/api/checkouts`                                                 | checkout workflow collection        | account                             | CHECKOUT WORKFLOW; creation and listing                            |
| GET               | `/api/checkouts/{checkoutId}`                                    | checkout workflow                   | account/buyer                       | CHECKOUT WORKFLOW; buyer-scoped detail                             |
| GET               | `/api/checkout-quote`                                            | checkout quote projection           | account                             | STANDALONE PROJECTION                                              |
| GET               | `/api/earnings/entries`                                          | earnings entries                    | account                             | KEEP                                                               |
| GET               | `/api/earnings`                                                  | earnings summary                    | account                             | KEEP                                                               |
| POST              | `/internal/funding/development/verify`                           | development funding verification    | session-only                        | FIRST-PARTY PROVIDER WORKFLOW / MOVED INTERNAL                     |
| GET               | `/api/health`                                                    | health                              | anonymous                           | KEEP                                                               |
| GET, POST, DELETE | `/api/listings/{listingId}/integrations`                         | listing integration collection      | session-only/owner                  | collection deletion accepts an ids body                            |
| GET, PATCH        | `/api/listings/{listingId}/integrations/{integrationId}`         | listing integration                 | session-only/owner                  | item inspection and metadata update                                |
| POST              | `/api/listings/{listingId}/integrations/{integrationId}/rotate`  | credential rotation                 | session-only/owner                  | TRUE COMMAND; replaces credential and returns new secret once      |
| GET, POST, DELETE | `/api/listings/{listingId}/media`                                | listing media collection            | account owner                       | collection deletion accepts an ids body                            |
| GET, PATCH        | `/api/listings/{listingId}/media/{mediaId}`                      | listing media                       | account owner                       | item inspection and metadata update                                |
| GET               | `/api/listings/{listingId}/access`                               | access redirect alias               | session-only                        | PROTOCOL/REDIRECT EXCEPTION / KEEP                                 |
| GET               | `/api/listings/{listingId}/referral-url`                         | listing referral URL                | session-only                        | KEEP; browser-session operation                                    |
| GET               | `/api/listings/export`                                           | listing export                      | account owner                       | KEEP; batch representation                                         |
| POST              | `/api/listings/import`                                           | listing import                      | account owner                       | KEEP; batch resource operation                                     |
| GET, PATCH        | `/api/listings/{listingId}`                                      | listing                             | public/owner                        | KEEP; PATCH accepts validated lifecycle state                      |
| GET, POST         | `/api/listings`                                                  | listing collection                  | public/account                      | KEEP                                                               |
| POST              | `/internal/me/onboarding`                                        | identity onboarding                 | session-only                        | SESSION-ONLY / MOVED INTERNAL                                      |
| GET, PATCH        | `/api/accounts/{accountId}`                                      | operator account management         | `accounts:read` / `accounts:manage` | CANONICAL ACCOUNT RESOURCE; self-profile is `/internal/me/profile` |
| GET               | `/api/distribution-policy`                                       | distribution policy                 | operator                            | KEEP                                                               |
| GET, POST, DELETE | `/api/listings/{listingId}/media`                                | operator listing media              | operator                            | collection delete uses a JSON ids array                            |
| GET, PATCH        | `/api/listings/{listingId}/media/{mediaId}`                      | operator listing media              | operator                            | item inspection and metadata update                                |
| POST              | `/api/listings/{listingId}/integrations/{integrationId}/rotate`  | operator credential rotation        | operator                            | TRUE COMMAND; replaces credential and returns new secret once      |
| GET, PATCH        | `/api/listings/{listingId}/integrations/{integrationId}`         | operator listing integration        | operator                            | item inspection and metadata update                                |
| GET, POST, DELETE | `/api/listings/{listingId}/integrations`                         | operator integration collection     | operator                            | collection delete uses a JSON ids array                            |
| GET               | `/api/listings/export`                                           | operator listing export             | operator                            | KEEP                                                               |
| POST              | `/api/listings/import`                                           | operator listing import             | operator                            | KEEP                                                               |
| GET, PATCH        | `/api/listings/{listingId}`                                      | operator listing                    | operator                            | KEEP; PATCH accepts validated lifecycle state                      |
| GET, POST         | `/api/listings`                                                  | operator listing collection         | operator                            | KEEP                                                               |
| GET               | `/api/payments`                                                  | provider-neutral payment collection | operator                            | CORE/SYSTEM API; provider is an optional collection filter         |
| GET               | `/api/payments/{paymentId}`                                      | payment detail                      | operator                            | CORE/SYSTEM API                                                    |
| GET               | `/api/payment-events`                                            | provider event collection           | operator                            | Payment Events resource; optional provider filter                  |
| GET               | `/api/payments/reconcile`                                        | reconciliation candidate projection | operator                            | PAYMENT RECONCILIATION STANDALONE GROUP                            |
| POST              | `/api/payments/{paymentId}/reconcile`                            | payment reconciliation command      | operator                            | PAYMENT COMMAND; resolves recorded provider through registry       |
| POST              | `/api/purchases/reverse`                                         | purchase reversal                   | operator                            | LEGACY DEBT; compensating resource operation, not deletion         |
| POST              | `/api/earnings/settlement`                                       | settlement batch                    | operator                            | LEGACY DEBT; batch processor operation                             |
| GET               | `/api/treasury/entries/{entryId}`                                | treasury entry                      | operator                            | KEEP; immutable fact                                               |
| GET, POST         | `/api/treasury/entries`                                          | treasury entries                    | operator                            | KEEP; POST creates a manual fact                                   |
| GET               | `/api/treasury`                                                  | treasury summary projection         | operator                            | STANDALONE PROJECTION                                              |
| POST              | `/internal/password-reset/request`                               | password-reset request              | anonymous                           | FIRST-PARTY AUTH WORKFLOW / MOVED INTERNAL                         |
| POST              | `/internal/password-reset`                                       | password reset completion           | anonymous/session                   | FIRST-PARTY AUTH WORKFLOW / MOVED INTERNAL                         |
| GET               | `/api/purchases/{purchaseId}`                                    | purchase                            | account/buyer                       | KEEP                                                               |
| GET               | `/api/purchases`                                                 | purchase collection                 | account/buyer                       | KEEP                                                               |
| GET               | `/api/referrals/direct`                                          | direct referrals                    | account                             | KEEP                                                               |
| GET               | `/api/referrals/account-url`                                     | referral URL                        | account                             | KEEP                                                               |
| GET               | `/api/referrals/downline`                                        | referral descendants                | account                             | KEEP                                                               |
| POST              | `/api/referrals/parent`                                          | parent assignment                   | account/session                     | LEGACY DEBT; domain assignment operation                           |
| GET               | `/api/referrals/uplines`                                         | upline projection                   | account                             | KEEP                                                               |
| GET, POST         | `/api/funding-transactions`                                      | funding transaction collection      | account                             | CANONICAL FUNDING TRANSACTIONS RESOURCE                            |
| GET               | `/api/funding-transactions/{fundingId}`                          | funding transaction                 | account                             | CANONICAL FUNDING TRANSACTIONS RESOURCE                            |
| POST              | `/api/funding-transactions/{fundingId}/cancel`                   | funding cancellation                | account                             | LEGACY DEBT; persisted funding state mutation                      |
| POST              | `/api/bank-transfer/funding-transactions/{fundingId}/evidence`   | funding evidence resource           | account                             | LEGITIMATE SUBRESOURCE / KEEP                                      |
| POST              | `/api/funding-transactions/{fundingId}/initialize`               | provider initialization process     | account                             | PROCESSING EXCEPTION / KEEP pending a funding-process contract     |
| POST              | `/api/direct-trc20/funding-transactions/{fundingId}/transaction` | provider transaction identity       | account                             | LEGITIMATE SUBRESOURCE / KEEP                                      |
| POST              | `/api/funding-transactions/{fundingId}/verify`                   | provider verification process       | account                             | PROCESSING EXCEPTION / KEEP; must remain server-side verification  |
| GET               | `/api/wallet/funding/prepare`                                    | funding preparation                 | account                             | STANDALONE PROJECTION                                              |
| GET               | `/api/wallet/transactions`                                       | wallet transaction collection       | account                             | KEEP; account-bound and scope-checked                              |
| GET               | `/api/wallet`                                                    | wallet summary                      | account                             | KEEP                                                               |
| GET               | `/api/withdrawals/policy`                                        | withdrawal policy                   | account                             | KEEP                                                               |
| GET, PATCH        | `/api/withdrawals/{withdrawalId}`                                | withdrawal                          | owner                               | NORMALIZE; PATCH cancellation, no DELETE                           |
| GET, POST         | `/api/withdrawals`                                               | withdrawal collection               | account                             | KEEP                                                               |

## Canonical Hono route inventory

The typed Hono registrations additionally expose the following canonical
contracts. The seven withdrawal/treasury overlaps above are intentionally
listed once in the compatibility table and once here because both registrations
are part of the current migration boundary.

| Methods            | Paths                                                                                                                                       | Resource/access decision                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET                | `/api/openapi.json`                                                                                                                         | schema discovery; protocol exception, separate from API principals                       |
| GET                | `/api/blog/categories`, `/api/blog/tags`                                                                                                    | public blog reference projections; KEEP                                                  |
| GET, POST          | `/api/blog/posts`                                                                                                                           | blog collection; KEEP                                                                    |
| GET, PATCH, DELETE | `/api/blog/posts/{postId}`                                                                                                                  | blog resource and public ID-or-slug projection; KEEP                                     |
| POST, DELETE       | `/internal/blog/previews`, `/internal/blog/previews/{previewId}`                                                                            | session-only temporary editor snapshot; private and expiring                             |
| GET                | `/api/hierarchy/tree`, `/api/hierarchy/search`, `/api/hierarchy/levels`, `/api/hierarchy/descendants`, `/api/hierarchy/children/{parentId}` | hierarchy projections; KEEP                                                              |
| PUT                | `/api/hierarchy/{accountId}/parent`                                                                                                         | adjacency assignment; LEGACY DEBT review, domain-owned and capability-protected          |
| GET                | `/internal/me/access`, `/internal/me/session`                                                                                               | session/account introspection; SESSION-ONLY / MOVED INTERNAL                             |
| GET, POST          | `/api/accounts`                                                                                                                             | operator account resources; KEEP                                                         |
| GET, PATCH         | `/api/accounts/{accountId}`                                                                                                                 | operator account projection/update; KEEP                                                 |
| GET, POST          | `/api/accounts/{accountId}/capabilities`                                                                                                    | capability assignment resource; KEEP                                                     |
| DELETE             | `/api/accounts/{accountId}/capabilities/{capability}`                                                                                       | capability revocation; LEGITIMATE revocation subresource, retained for existing contract |
| GET                | `/internal/overview`, `/api/distributions`, `/api/earnings/entries`, `/api/funding`, `/api/treasury`                                        | overview is internal; resources remain public                                            |
| GET                | `/api/distributions/{distributionId}`, `/api/funding/{fundingId}`, `/api/treasury/entries/{entryId}`                                        | operator detail resources; KEEP                                                          |
| POST               | `/internal/funding/bank-transfer/{fundingId}/confirm`                                                                                       | optional Bank Transfer provider workflow; kept outside generic Funding API               |
| POST               | `/api/treasury/entries`                                                                                                                     | manual treasury fact creation; KEEP                                                      |
| GET, PATCH         | `/api/withdrawals/{withdrawalId}`                                                                                                           | operator withdrawal resource; PATCH is the canonical state mutation                      |
| GET                | `/api/withdrawals`                                                                                                                          | operator withdrawal collection; KEEP                                                     |

## State PATCH contracts

Operator withdrawal PATCH accepts a strict discriminated body:

```json
{ "status": "approved" }
{ "status": "rejected", "reason": "..." }
{ "status": "completed", "external_reference": "...", "note": "..." }
```

The route calls the existing application/domain services. It does not assign a
state directly, so invalid transitions remain conflicts/errors and reservation
release/completion stays transactional. Owner cancellation accepts only:

```json
{ "status": "cancelled" }
```

Neither route accepts arbitrary fields or an arbitrary target account.

## Remaining API debt

Ordinary listing, review, and blog lifecycle/status changes are resource PATCH
operations with validated request bodies. UI bulk selection remains a client
workflow that repeats canonical single-resource calls; there are no `/bulk`
compatibility or OpenAPI routes. Dedicated action routes remain only where the
operation is a genuine command, such as credential rotation, checkout payment,
funding process operations, API-key revocation, settlement/reversal, and
provider reconciliation. Provider callbacks, Better Auth, access redirects,
evidence, media, and transaction identities are protocol or noun subresources.

## Manual withdrawal direction

Cliqero reserves earnings, supports operator review, and records completion
after money has been sent externally. The API is available to external
automation clients, but Cliqero does not execute transfers internally. Both the
operator UI and an automation update the same withdrawal resource with PATCH.

# Historical API inventory — superseded

This document records an earlier surface audit and is retained as historical
context. Its KEEP/MOVE dispositions are not current: current-session routes,
blog previews, password reset, dashboard overview, and provider-specific
funding workflows have since been moved to `/internal/*`; Account, Listing,
and Earning Entry use canonical resource paths. Consult
`docs/architecture/api-surface.md` and
`docs/integrations/public-api-matrix.md` for the current contract.
