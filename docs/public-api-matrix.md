# Public HTTP API verification matrix

The development audit is reproducible with `node scripts/audit-http-api.mjs`. It uses synthetic accounts and the development funding provider, never Paystack. `Idem.` means the endpoint requires or honors `Idempotency-Key`.

| Method | Path | Auth | Capability | Input | Success | Persisted fact | Dependencies | Idem. | HTTP result |
|---|---|---|---|---|---:|---|---|---|---|
| GET | `/api/health` | no | runtime | none | 200 | none | none | n/a | 200 |
| POST | `/api/accounts` | no | identity | email, handle, password, country? | 201 | account | PostgreSQL | unique identity | 201; invalid 400 |
| POST | `/api/auth/sessions` | no | identity | email, password | 200 | session | identity | n/a | 200; invalid 401 |
| POST | `/api/listings` | account | listing | listing snapshot | 201 | published listing | identity | n/a | 201; invalid 400 |
| GET | `/api/listings/:id` | no | listing | path id | 200 | none | listing | n/a | 200; missing 404 |
| PATCH | `/api/listings/:id` | owner | listing | listing snapshot | 200 | updated listing | listing/authorization | n/a | 200; wrong owner 403 |
| POST | `/api/checkout` | account | checkout | `listing_id` only | 201 | checkout + pending purchase | listing, wallet snapshot | required | 201; unauth 401; provider field 400 |
| GET | `/api/checkout/:id` | buyer | checkout | path id | 200 | none | checkout | n/a | 200; wrong buyer 404 |
| POST | `/api/wallet/fund` | account | funding | USD amount, provider, collection currency? | 201 | funding transaction | provider registry, FX when needed | required | 201; repeated key 201; invalid 400 |
| POST | `/api/funding/development/verify` | owner | funding | funding id | 200 | confirmation when eligible | development provider | provider reference | 200 |
| GET | `/api/wallet` | account | wallet | none | 200 | none | wallet ledger | n/a | 200; unauth 401 |
| GET | `/api/wallet/transactions` | account | wallet | none | 200 | none | wallet ledger | n/a | 200 |
| POST | `/api/integrations` | listing owner | integration | name, listing id | 201 | scoped credential hash | listing/access | n/a | 201; wrong owner 403 |
| POST | `/api/access/verify` | integration | access | opaque source | 200 | none | access grant + entitlement | n/a | unauthorized 401; invalid source returns denied 200 |
| GET | `/access/:purchaseId` | buyer | access | purchase id | 307 | opaque grant | purchase, entitlement, listing | optional grant key | pending purchase denied 404; success covered in integration |
| GET | `/api/listings/:id/access` | buyer | access (legacy alias) | listing id | 307 | opaque grant | entitlement/listing | optional grant key | no entitlement 404 |
| POST | `/api/listings/:id/referral-link` | account | referral | listing id | 201 | referral link | listing/referral | stable link | 201 |
| POST | `/api/referrals/parent` | account | referral | parent account id | 204 | immutable parent edge | identity/referral | unique child | 204 |
| GET | `/api/referrals/direct` | account | referral | cursor/limit | 200 | none | referral | n/a | 200 |
| GET | `/api/referrals/downline` | account | referral | depth/cursor/limit | 200 | none | referral | n/a | 200 |
| GET | `/api/referrals/uplines` | account | referral | none | 200 | none | referral | n/a | 200 |
| POST | `/api/withdrawals` | account | withdrawal | amount, USD, destination | 201 | requested withdrawal + reservation | withdrawable earnings only | required | insufficient funds 400 |
| GET | `/api/withdrawals` | account | withdrawal | none | 200 | none | withdrawal | n/a | 200 |
| GET | `/api/withdrawals/:id` | owner | withdrawal | path id | 200 | none | withdrawal | n/a | missing 404 |
| DELETE | `/api/withdrawals/:id` | owner | withdrawal | path id | 200 | cancellation/release | withdrawal/reservation | transition-idempotent | missing 404 |
| POST | `/api/webhooks/paystack` | provider signature | integration ingress | raw provider event | 200 | provider event + verification work | Paystack signature, event store | event identity | invalid signature 401 |

## Operator/internal surface

These routes were exercised with an authenticated non-operator and rejected (403), proving the public authorization boundary. Their valid domain behavior is covered by PostgreSQL integration tests rather than granting operator authority in the public audit fixture.

| Method | Path | Capability | Input | Success | Persisted fact | Idem. | HTTP auth result |
|---|---|---|---|---:|---|---|---|
| GET | `/api/operator/paystack/events` | provider audit | limit | 200 | none | n/a | 403 |
| GET | `/api/operator/paystack/reconcile` | legacy provider reconciliation | age/limit | 200 | none | n/a | 403 |
| POST | `/api/operator/paystack/reconcile` | legacy provider reconciliation | payment id | 200 | reconciliation attempt | required | non-operator rejected |
| POST | `/api/operator/purchases/reverse` | reversal | purchase id, reason | 200 | compensating entries/reversal | required | 403 |
| POST | `/api/operator/settlement` | earnings settlement | batch size | 200 | settlements | entry uniqueness | 403 |
| GET | `/api/operator/withdrawals` | withdrawal operations | state? | 200 | none | n/a | 403 |
| GET | `/api/operator/withdrawals/:id` | withdrawal operations | path id | 200 | none | n/a | 403 |
| POST | `/api/operator/withdrawals/:id/approve` | withdrawal operations | path id | 200 | approval | state transition | 403 |
| POST | `/api/operator/withdrawals/:id/reject` | withdrawal operations | reason | 200 | rejection/reservation release | state transition | non-operator rejected before transition |
| POST | `/api/operator/withdrawals/:id/complete` | payout operations | path id | 200 | manual completion | state transition | 403 |
| GET | `/api/operator/withdrawals/:id/payout` | payout audit | path id | 200 | none | n/a | 403 |
| POST | `/api/operator/withdrawals/:id/payout` | payout execution | path id | 200 | payout attempt | stable execution | 403 |
| POST | `/api/operator/withdrawals/:id/payout/reconcile` | payout reconciliation | path id | 200 | reconciliation result | repeat-safe | 403 |

The audit intentionally does not call a live payment or payout provider.
