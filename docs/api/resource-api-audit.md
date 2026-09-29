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

| Previous route                        | Canonical route                                                                          | Decision                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| `DELETE /api/withdrawals/{id}`        | `PATCH /api/withdrawals/{id}` with `{ status: "cancelled" }`                             | NORMALIZE; cancellation retains the record |
| `POST /api/withdrawals/{id}/approve`  | `PATCH /api/withdrawals/{id}` with `{ status: "approved" }`                              | REMOVE/REPLACE                             |
| `POST /api/withdrawals/{id}/reject`   | `PATCH /api/withdrawals/{id}` with `{ status: "rejected", reason }`                      | REMOVE/REPLACE                             |
| `POST /api/withdrawals/{id}/complete` | `PATCH /api/withdrawals/{id}` with `{ status: "completed", external_reference?, note? }` | REMOVE/REPLACE                             |

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

| Methods            | Current path                                                     | Resource/owner                       | Access                 | Classification / decision                                                   |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------ | ---------------------- | --------------------------------------------------------------------------- |
| POST               | `/api/access/verify`                                             | access/integration                   | integration credential | PROTOCOL EXCEPTION / KEEP                                                   |
| POST               | `/api/accounts`                                                  | account creation                     | anonymous              | KEEP                                                                        |
| POST               | `/api/checkout/{id}/pay`                                         | checkout payment                     | account                | LEGACY DEBT; payment command requires a dedicated checkout/payment contract |
| GET                | `/api/checkout/{id}`                                             | checkout                             | account/buyer          | KEEP                                                                        |
| GET, POST          | `/api/checkout`                                                  | checkout collection                  | account                | KEEP                                                                        |
| GET                | `/api/earnings/entries`                                          | earnings entries                     | account                | KEEP                                                                        |
| GET                | `/api/earnings`                                                  | earnings summary                     | account                | KEEP                                                                        |
| POST               | `/api/funding/development/verify`                                | development funding verification     | session-only           | PROTOCOL/DEVELOPMENT EXCEPTION / KEEP                                       |
| GET                | `/api/health`                                                    | health                               | anonymous              | KEEP                                                                        |
| GET, POST          | `/api/listings/{listingId}/integrations`                         | listing integration collection       | session-only/owner     | KEEP; owner context is explicit                                             |
| GET, PATCH, DELETE | `/api/listings/{listingId}/integrations/{integrationId}`         | listing integration                  | session-only/owner     | KEEP; listing context and ownership checked                                 |
| POST               | `/api/listings/{listingId}/integrations/{integrationId}/rotate`  | credential rotation                  | session-only/owner     | TRUE COMMAND; replaces credential and returns new secret once               |
| GET, POST          | `/api/listings/{id}/media`                                       | listing media collection             | account owner          | LEGITIMATE SUBRESOURCE / KEEP                                               |
| GET, PATCH, DELETE | `/api/listings/{id}/media/{mediaId}`                             | listing media                        | account owner          | LEGITIMATE SUBRESOURCE / KEEP                                               |
| GET                | `/api/listings/{id}/access`                                      | access redirect alias                | session-only           | PROTOCOL/REDIRECT EXCEPTION / KEEP                                          |
| GET                | `/api/listings/{id}/referral-url`                                | listing referral URL                 | session-only           | KEEP; browser-session operation                                             |
| GET                | `/api/listings/export`                                           | listing export                       | account owner          | KEEP; batch representation                                                  |
| POST               | `/api/listings/import`                                           | listing import                       | account owner          | KEEP; batch resource operation                                              |
| GET, PATCH         | `/api/listings/{id}`                                             | listing                              | public/owner           | KEEP; PATCH accepts validated lifecycle state                               |
| GET, POST          | `/api/listings`                                                  | listing collection                   | public/account         | KEEP                                                                        |
| GET                | `/api/me/listings`                                               | owned listing collection             | account                | KEEP                                                                        |
| POST               | `/api/me/onboarding`                                             | identity onboarding                  | session-only           | SESSION-ONLY / KEEP                                                         |
| GET, PATCH         | `/api/me/profile`                                                | profile                              | session-only           | SESSION-ONLY / KEEP                                                         |
| GET                | `/api/distribution-policy`                                       | distribution policy                  | operator               | KEEP                                                                        |
| GET, POST          | `/api/listings/{id}/media`                                       | operator listing media               | operator               | LEGITIMATE SUBRESOURCE / KEEP                                               |
| GET, PATCH, DELETE | `/api/listings/{id}/media/{mediaId}`                             | operator listing media               | operator               | LEGITIMATE SUBRESOURCE / KEEP                                               |
| POST               | `/api/listings/{id}/integrations/{integrationId}/rotate`         | operator credential rotation         | operator               | TRUE COMMAND; replaces credential and returns new secret once               |
| GET, PATCH, DELETE | `/api/listings/{id}/integrations/{integrationId}`                | operator listing integration         | operator               | KEEP                                                                        |
| GET, POST          | `/api/listings/{id}/integrations`                                | operator integration collection      | operator               | KEEP                                                                        |
| GET                | `/api/listings/export`                                           | operator listing export              | operator               | KEEP                                                                        |
| POST               | `/api/listings/import`                                           | operator listing import              | operator               | KEEP                                                                        |
| GET, PATCH         | `/api/listings/{id}`                                             | operator listing                     | operator               | KEEP; PATCH accepts validated lifecycle state                               |
| GET, POST          | `/api/listings`                                                  | operator listing collection          | operator               | KEEP                                                                        |
| GET                | `/api/payments`                                                  | provider-neutral payment collection  | operator               | CORE/SYSTEM API; provider is an optional collection filter                  |
| GET                | `/api/payments/{paymentId}`                                      | payment detail                       | operator               | CORE/SYSTEM API                                                             |
| GET                | `/api/payments/events`                                           | provider event collection            | operator               | CORE/SYSTEM API; optional provider filter                                   |
| GET, POST          | `/api/payments/reconcile`, `/api/payments/{paymentId}/reconcile` | reconciliation operations            | operator               | CORE/SYSTEM API; resolves recorded provider through registry                |
| POST               | `/api/purchases/reverse`                                         | purchase reversal                    | operator               | LEGACY DEBT; compensating resource operation, not deletion                  |
| POST               | `/api/earnings/settlement`                                       | settlement batch                     | operator               | LEGACY DEBT; batch processor operation                                      |
| GET                | `/api/treasury/entries/{id}`                                     | treasury entry                       | operator               | KEEP; immutable fact                                                        |
| GET, POST          | `/api/treasury/entries`                                          | treasury entries                     | operator               | KEEP; POST creates a manual fact                                            |
| POST               | `/api/treasury/expenses`                                         | treasury expense compatibility alias | operator               | LEGACY DEBT; noun entry creation should become canonical                    |
| GET, POST          | `/api/treasury`                                                  | treasury summary/legacy create       | operator               | KEEP for current compatibility, follow-up cleanup documented                |
| POST               | `/api/password-reset/request`                                    | password-reset request               | anonymous              | PROTOCOL/SESSION EXCEPTION / KEEP                                           |
| POST               | `/api/password-reset`                                            | password reset completion            | anonymous/session      | PROTOCOL/SESSION EXCEPTION / KEEP                                           |
| GET                | `/api/purchases/{id}`                                            | purchase                             | account/buyer          | KEEP                                                                        |
| GET                | `/api/purchases`                                                 | purchase collection                  | account/buyer          | KEEP                                                                        |
| GET                | `/api/referrals/direct`                                          | direct referrals                     | account                | KEEP                                                                        |
| GET                | `/api/referrals/account-url`                                     | referral URL                         | account                | KEEP                                                                        |
| GET                | `/api/referrals/downline`                                        | referral descendants                 | account                | KEEP                                                                        |
| POST               | `/api/referrals/parent`                                          | parent assignment                    | account/session        | LEGACY DEBT; domain assignment operation                                    |
| GET                | `/api/referrals/uplines`                                         | upline projection                    | account                | KEEP                                                                        |
| POST               | `/api/wallet/fund`                                               | funding collection                   | account                | KEEP                                                                        |
| POST               | `/api/wallet/fund/{id}/cancel`                                   | funding cancellation                 | account                | LEGACY DEBT; persisted funding state mutation                               |
| POST               | `/api/wallet/fund/{id}/evidence`                                 | funding evidence resource            | account                | LEGITIMATE SUBRESOURCE / KEEP                                               |
| POST               | `/api/wallet/fund/{id}/initialize`                               | provider initialization process      | account                | PROCESSING EXCEPTION / KEEP pending a funding-process contract              |
| POST               | `/api/wallet/fund/{id}/transaction`                              | provider transaction identity        | account                | LEGITIMATE SUBRESOURCE / KEEP                                               |
| POST               | `/api/wallet/fund/{id}/verify`                                   | provider verification process        | account                | PROCESSING EXCEPTION / KEEP; must remain server-side verification           |
| GET                | `/api/wallet/fund/{id}`                                          | funding projection                   | account                | KEEP                                                                        |
| GET                | `/api/wallet/funding/prepare`                                    | funding preparation                  | account                | KEEP                                                                        |
| GET                | `/api/wallet/funding`                                            | funding history                      | account                | KEEP                                                                        |
| GET                | `/api/wallet/transactions`                                       | wallet transaction collection        | account                | KEEP; account-bound and scope-checked                                       |
| GET                | `/api/wallet`                                                    | wallet summary                       | account                | KEEP                                                                        |
| GET                | `/api/withdrawals/policy`                                        | withdrawal policy                    | account                | KEEP                                                                        |
| GET, PATCH         | `/api/withdrawals/{id}`                                          | withdrawal                           | owner                  | NORMALIZE; PATCH cancellation, no DELETE                                    |
| GET, POST          | `/api/withdrawals`                                               | withdrawal collection                | account                | KEEP                                                                        |

## Canonical Hono route inventory

The typed Hono registrations additionally expose the following canonical
contracts. The seven withdrawal/treasury overlaps above are intentionally
listed once in the compatibility table and once here because both registrations
are part of the current migration boundary.

| Methods            | Paths                                                                                                                                       | Resource/access decision                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GET                | `/api/openapi.json`                                                                                                                         | schema discovery; protocol exception, separate from API principals                              |
| GET                | `/api/blog/categories`, `/api/blog/tags`                                                                                                    | public blog reference projections; KEEP                                                         |
| GET, POST          | `/api/blog/posts`                                                                                                                           | blog collection; KEEP                                                                           |
| GET, PATCH, DELETE | `/api/blog/posts/{id}`                                                                                                                      | blog resource; KEEP                                                                             |
| GET                | `/api/blog/posts/{slug}`                                                                                                                    | public blog projection; KEEP                                                                    |
| POST, DELETE       | `/api/blog/previews`, `/api/blog/previews/{previewId}`                                                                                      | session-only temporary editor snapshot; private and expiring                                    |
| GET                | `/api/hierarchy/tree`, `/api/hierarchy/search`, `/api/hierarchy/levels`, `/api/hierarchy/descendants`, `/api/hierarchy/children/{parentId}` | hierarchy projections; KEEP                                                                     |
| PUT                | `/api/hierarchy/{accountId}/parent`                                                                                                         | adjacency assignment; LEGACY DEBT review, domain-owned and capability-protected                 |
| GET                | `/api/me/access`, `/api/me/session`                                                                                                         | session/account introspection; SESSION-ONLY / KEEP                                              |
| GET, POST          | `/api/api-keys`                                                                                                                             | account API-key collection; KEEP                                                                |
| DELETE             | `/api/api-keys/{id}/revoke`                                                                                                                 | key revocation; LEGACY DEBT review because it is a state change, not physical deletion          |
| GET, POST          | `/api/accounts`, `/api/accounts/{accountId}/api-keys`                                                                                       | operator account/key resources; KEEP                                                            |
| GET, PATCH         | `/api/accounts/{accountId}`                                                                                                                 | operator account projection/update; KEEP                                                        |
| GET, POST          | `/api/accounts/{accountId}/capabilities`                                                                                                    | capability assignment resource; KEEP                                                            |
| DELETE             | `/api/accounts/{accountId}/capabilities/{capability}`                                                                                       | capability revocation; LEGITIMATE revocation subresource, retained for existing contract        |
| GET                | `/api/overview`, `/api/distributions`, `/api/earnings/entries`, `/api/funding`, `/api/treasury`                                             | operator projections; KEEP                                                                      |
| GET                | `/api/distributions/{distributionId}`, `/api/funding/{fundingId}`, `/api/treasury/entries/{entryId}`                                        | operator detail resources; KEEP                                                                 |
| POST               | `/api/funding/{fundingId}/confirm-bank-transfer`                                                                                            | bank-transfer confirmation; PROTOCOL/operations exception, future typed funding PATCH candidate |
| POST               | `/api/treasury/entries`                                                                                                                     | manual treasury fact creation; KEEP                                                             |
| GET, PATCH         | `/api/withdrawals/{withdrawalId}`                                                                                                           | operator withdrawal resource; PATCH is the canonical state mutation                             |
| GET                | `/api/withdrawals`                                                                                                                          | operator withdrawal collection; KEEP                                                            |

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
