# Resource API audit

This audit records the application API exposed by the Hono router and its
internal compatibility dispatch registry. The compatibility modules are not a
second business API: Hono performs principal resolution and dispatches them
after route matching.

## Scope and counts

The audit inspected 69 compatibility path patterns and 38 Hono path patterns;
three patterns are shared by both surfaces, giving 104 unique application API
path patterns. Better Auth, media/navigation routes, and provider callbacks
were inspected separately as protocol or framework boundaries.

The withdrawal normalization completed in this change has these decisions:

| Previous route                                 | Canonical route                                                                                   | Decision                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `DELETE /api/withdrawals/{id}`                 | `PATCH /api/withdrawals/{id}` with `{ status: "cancelled" }`                                      | NORMALIZE; cancellation retains the record |
| `POST /api/operator/withdrawals/{id}/approve`  | `PATCH /api/operator/withdrawals/{id}` with `{ status: "approved" }`                              | REMOVE/REPLACE                             |
| `POST /api/operator/withdrawals/{id}/reject`   | `PATCH /api/operator/withdrawals/{id}` with `{ status: "rejected", reason }`                      | REMOVE/REPLACE                             |
| `POST /api/operator/withdrawals/{id}/complete` | `PATCH /api/operator/withdrawals/{id}` with `{ status: "completed", external_reference?, note? }` | REMOVE/REPLACE                             |

The old operator state routes are no longer registered or represented in
OpenAPI. Payout execution remains a noun subresource because it creates or
reconciles a separate payout-attempt resource; it is not a second withdrawal
state-mutation API.

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

| Methods                  | Current path                                                      | Resource/owner                       | Access                 | Classification / decision                                                                           |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------- |
| POST                     | `/api/access/verify`                                              | access/integration                   | integration credential | PROTOCOL EXCEPTION / KEEP                                                                           |
| POST                     | `/api/accounts`                                                   | account creation                     | anonymous              | KEEP                                                                                                |
| POST                     | `/api/checkout/{id}/pay`                                          | checkout payment                     | account                | LEGACY DEBT; payment command requires a dedicated checkout/payment contract                         |
| GET                      | `/api/checkout/{id}`                                              | checkout                             | account/buyer          | KEEP                                                                                                |
| GET, POST                | `/api/checkout`                                                   | checkout collection                  | account                | KEEP                                                                                                |
| GET                      | `/api/earnings/entries`                                           | earnings entries                     | account                | KEEP                                                                                                |
| GET                      | `/api/earnings`                                                   | earnings summary                     | account                | KEEP                                                                                                |
| POST                     | `/api/funding/development/verify`                                 | development funding verification     | session-only           | PROTOCOL/DEVELOPMENT EXCEPTION / KEEP                                                               |
| GET                      | `/api/health`                                                     | health                               | anonymous              | KEEP                                                                                                |
| GET, POST, PATCH, DELETE | `/api/integrations/{id}`                                          | integration credential               | session-only/owner     | LEGACY DEBT; DELETE revokes state rather than deleting the credential                               |
| GET, POST                | `/api/integrations`                                               | integration collection               | session-only/owner     | KEEP                                                                                                |
| POST                     | `/api/integrations/{id}/rotate`                                   | integration credential rotation      | session-only/owner     | LEGACY DEBT; security rotation needs an explicit credential subresource decision                    |
| GET, POST                | `/api/listings/{id}/media`                                        | listing media collection             | account owner          | LEGITIMATE SUBRESOURCE / KEEP                                                                       |
| GET, PATCH, DELETE       | `/api/listings/{id}/media/{mediaId}`                              | listing media                        | account owner          | LEGITIMATE SUBRESOURCE / KEEP                                                                       |
| GET                      | `/api/listings/{id}/access`                                       | access redirect alias                | session-only           | PROTOCOL/REDIRECT EXCEPTION / KEEP                                                                  |
| POST                     | `/api/listings/{id}/publish`                                      | listing state                        | account owner          | LEGACY DEBT; candidate for typed listing PATCH                                                      |
| GET                      | `/api/listings/{id}/referral-url`                                 | listing referral URL                 | session-only           | KEEP; browser-session operation                                                                     |
| POST                     | `/api/listings/{id}/restore`                                      | listing state                        | account owner          | LEGACY DEBT; candidate for typed listing PATCH                                                      |
| GET                      | `/api/listings/export`                                            | listing export                       | account owner          | KEEP; batch representation                                                                          |
| POST                     | `/api/listings/import`                                            | listing import                       | account owner          | KEEP; batch resource operation                                                                      |
| GET, PATCH, DELETE       | `/api/listings/{id}`                                              | listing                              | public/owner           | LEGACY DEBT; DELETE archives rather than deleting the listing; use a typed lifecycle mutation later |
| GET, POST                | `/api/listings`                                                   | listing collection                   | public/account         | KEEP                                                                                                |
| GET                      | `/api/me/listings`                                                | owned listing collection             | account                | KEEP                                                                                                |
| POST                     | `/api/me/onboarding`                                              | identity onboarding                  | session-only           | SESSION-ONLY / KEEP                                                                                 |
| GET, PATCH               | `/api/me/profile`                                                 | profile                              | session-only           | SESSION-ONLY / KEEP                                                                                 |
| GET                      | `/api/operator/distribution-policy`                               | distribution policy                  | operator               | KEEP                                                                                                |
| GET, POST                | `/api/operator/listings/{id}/media`                               | operator listing media               | operator               | LEGITIMATE SUBRESOURCE / KEEP                                                                       |
| GET, PATCH, DELETE       | `/api/operator/listings/{id}/media/{mediaId}`                     | operator listing media               | operator               | LEGITIMATE SUBRESOURCE / KEEP                                                                       |
| POST                     | `/api/operator/listings/{id}/integrations/{integrationId}/rotate` | operator integration rotation        | operator               | LEGACY DEBT; security rotation review                                                               |
| GET, PATCH, DELETE       | `/api/operator/listings/{id}/integrations/{integrationId}`        | operator integration                 | operator               | LEGACY DEBT; DELETE revokes state rather than deleting the integration                              |
| GET, POST                | `/api/operator/listings/{id}/integrations`                        | operator integration collection      | operator               | KEEP                                                                                                |
| POST                     | `/api/operator/listings/{id}/publish`                             | operator listing state               | operator               | LEGACY DEBT; candidate for typed listing PATCH                                                      |
| POST                     | `/api/operator/listings/{id}/restore`                             | operator listing state               | operator               | LEGACY DEBT; candidate for typed listing PATCH                                                      |
| GET                      | `/api/operator/listings/export`                                   | operator listing export              | operator               | KEEP                                                                                                |
| POST                     | `/api/operator/listings/import`                                   | operator listing import              | operator               | KEEP                                                                                                |
| GET, PATCH, DELETE       | `/api/operator/listings/{id}`                                     | operator listing                     | operator               | LEGACY DEBT; DELETE archives rather than deleting the listing; use a typed lifecycle mutation later |
| GET, POST                | `/api/operator/listings`                                          | operator listing collection          | operator               | KEEP                                                                                                |
| GET                      | `/api/operator/paystack/events`                                   | provider events                      | operator               | PROTOCOL/AUDIT EXCEPTION / KEEP                                                                     |
| GET, POST                | `/api/operator/paystack/reconcile`                                | provider reconciliation              | operator               | LEGACY DEBT; provider reconciliation is a protocol operation                                        |
| POST                     | `/api/operator/purchases/reverse`                                 | purchase reversal                    | operator               | LEGACY DEBT; compensating resource operation, not deletion                                          |
| POST                     | `/api/operator/settlement`                                        | settlement batch                     | operator               | LEGACY DEBT; batch processor operation                                                              |
| GET                      | `/api/operator/treasury/entries/{id}`                             | treasury entry                       | operator               | KEEP; immutable fact                                                                                |
| GET, POST                | `/api/operator/treasury/entries`                                  | treasury entries                     | operator               | KEEP; POST creates a manual fact                                                                    |
| POST                     | `/api/operator/treasury/expenses`                                 | treasury expense compatibility alias | operator               | LEGACY DEBT; noun entry creation should become canonical                                            |
| GET, POST                | `/api/operator/treasury`                                          | treasury summary/legacy create       | operator               | KEEP for current compatibility, follow-up cleanup documented                                        |
| POST                     | `/api/password-reset/request`                                     | password-reset request               | anonymous              | PROTOCOL/SESSION EXCEPTION / KEEP                                                                   |
| POST                     | `/api/password-reset`                                             | password reset completion            | anonymous/session      | PROTOCOL/SESSION EXCEPTION / KEEP                                                                   |
| GET                      | `/api/purchases/{id}`                                             | purchase                             | account/buyer          | KEEP                                                                                                |
| GET                      | `/api/purchases`                                                  | purchase collection                  | account/buyer          | KEEP                                                                                                |
| GET                      | `/api/referrals/direct`                                           | direct referrals                     | account                | KEEP                                                                                                |
| GET                      | `/api/referrals/account-url`                                      | referral URL                         | account                | KEEP                                                                                                |
| GET                      | `/api/referrals/downline`                                         | referral descendants                 | account                | KEEP                                                                                                |
| POST                     | `/api/referrals/parent`                                           | parent assignment                    | account/session        | LEGACY DEBT; domain assignment operation                                                            |
| GET                      | `/api/referrals/uplines`                                          | upline projection                    | account                | KEEP                                                                                                |
| POST                     | `/api/wallet/fund`                                                | funding collection                   | account                | KEEP                                                                                                |
| POST                     | `/api/wallet/fund/{id}/cancel`                                    | funding cancellation                 | account                | LEGACY DEBT; persisted funding state mutation                                                       |
| POST                     | `/api/wallet/fund/{id}/evidence`                                  | funding evidence resource            | account                | LEGITIMATE SUBRESOURCE / KEEP                                                                       |
| POST                     | `/api/wallet/fund/{id}/initialize`                                | provider initialization process      | account                | PROCESSING EXCEPTION / KEEP pending a funding-process contract                                      |
| POST                     | `/api/wallet/fund/{id}/transaction`                               | provider transaction identity        | account                | LEGITIMATE SUBRESOURCE / KEEP                                                                       |
| POST                     | `/api/wallet/fund/{id}/verify`                                    | provider verification process        | account                | PROCESSING EXCEPTION / KEEP; must remain server-side verification                                   |
| GET                      | `/api/wallet/fund/{id}`                                           | funding projection                   | account                | KEEP                                                                                                |
| GET                      | `/api/wallet/funding/prepare`                                     | funding preparation                  | account                | KEEP                                                                                                |
| GET                      | `/api/wallet/funding`                                             | funding history                      | account                | KEEP                                                                                                |
| GET                      | `/api/wallet/transactions`                                        | wallet transaction collection        | account                | KEEP; account-bound and scope-checked                                                               |
| GET                      | `/api/wallet`                                                     | wallet summary                       | account                | KEEP                                                                                                |
| GET                      | `/api/withdrawals/policy`                                         | withdrawal policy                    | account                | KEEP                                                                                                |
| GET, PATCH               | `/api/withdrawals/{id}`                                           | withdrawal                           | owner                  | NORMALIZE; PATCH cancellation, no DELETE                                                            |
| GET, POST                | `/api/withdrawals`                                                | withdrawal collection                | account                | KEEP                                                                                                |

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
| POST               | `/api/blog/posts/{id}/publish`, `/api/blog/posts/{id}/unpublish`                                                                            | LEGACY DEBT; typed post PATCH candidate                                                         |
| GET                | `/api/hierarchy/tree`, `/api/hierarchy/search`, `/api/hierarchy/levels`, `/api/hierarchy/descendants`, `/api/hierarchy/children/{parentId}` | hierarchy projections; KEEP                                                                     |
| PUT                | `/api/operator/hierarchy/{accountId}/parent`                                                                                                | adjacency assignment; LEGACY DEBT review, domain-owned and capability-protected                 |
| GET                | `/api/me/access`, `/api/me/session`                                                                                                         | session/account introspection; SESSION-ONLY / KEEP                                              |
| GET, POST          | `/api/api-keys`                                                                                                                             | account API-key collection; KEEP                                                                |
| DELETE             | `/api/api-keys/{id}/revoke`                                                                                                                 | key revocation; LEGACY DEBT review because it is a state change, not physical deletion          |
| GET, POST          | `/api/operator/accounts`, `/api/operator/accounts/{accountId}/api-keys`                                                                     | operator account/key resources; KEEP                                                            |
| GET, PATCH         | `/api/operator/accounts/{accountId}`                                                                                                        | operator account projection/update; KEEP                                                        |
| GET, POST          | `/api/operator/accounts/{accountId}/capabilities`                                                                                           | capability assignment resource; KEEP                                                            |
| DELETE             | `/api/operator/accounts/{accountId}/capabilities/{capability}`                                                                              | capability revocation; LEGITIMATE revocation subresource, retained for existing contract        |
| GET                | `/api/operator/overview`, `/api/operator/distributions`, `/api/operator/earnings`, `/api/operator/funding`, `/api/operator/treasury`        | operator projections; KEEP                                                                      |
| GET                | `/api/operator/distributions/{distributionId}`, `/api/operator/funding/{fundingId}`, `/api/operator/treasury/entries/{entryId}`             | operator detail resources; KEEP                                                                 |
| POST               | `/api/operator/funding/{fundingId}/confirm-bank-transfer`                                                                                   | bank-transfer confirmation; PROTOCOL/operations exception, future typed funding PATCH candidate |
| POST               | `/api/operator/treasury/entries`                                                                                                            | manual treasury fact creation; KEEP                                                             |
| GET, PATCH         | `/api/operator/withdrawals/{withdrawalId}`                                                                                                  | operator withdrawal resource; PATCH is the canonical state mutation                             |
| GET                | `/api/operator/withdrawals`                                                                                                                 | operator withdrawal collection; KEEP                                                            |
| POST               | `/api/operator/withdrawals/{withdrawalId}/payout`, `/api/operator/withdrawals/{withdrawalId}/payout/reconcile`                              | payout-attempt subresources; KEEP as separate provider/process resources                        |

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

The audit found command-shaped or process-shaped paths outside the withdrawal
correction: listing publish/restore, blog publish/unpublish, integration
rotation, checkout payment, funding process operations, API-key revoke,
operator settlement/reversal, and provider reconciliation. They remain
explicitly recorded above rather than being mechanically rewritten: each needs
its own typed resource/process contract and browser/test migration. Provider
callbacks, Better Auth, access redirects, evidence, media, payout attempts, and
transaction identities are legitimate protocol or noun subresources.

## Payout direction

The existing automatic payout components remain in place and were not expanded:

- `PayoutExecutionProcessor` prepares idempotent attempts, submits through the
  configured `PayoutProviderRegistry`, and reconciles unknown outcomes.
- `DevelopmentPayoutProvider` supplies local deterministic behavior.
- configured payout providers under `src/providers/payout/` implement provider
  protocol calls.

This is potentially inconsistent with the current manual-withdrawal product
direction, but removing it would be a separate lifecycle/provider project. The
canonical withdrawal API now also supports an operator recording a manual
completion through PATCH without requiring provider execution.
