# Reliability, Fraud, and Audit

[Back to documentation index](./README.md)

## Reliability standard

Cliqero handles real money, referral attribution, and access rights. Implemented behavior must be reliable enough for production use even when the first release is narrow.

The system should be designed for retries, duplicate webhooks, partial failures, unavailable optional modules, unauthorized access attempts, and administrative investigation.

## Idempotency

Every financially or authorization-meaningful operation must be idempotent where repetition can occur.

Examples:

- payment verification;
- purchase finalization;
- entitlement creation;
- commission distribution;
- withdrawal state transitions;
- provider webhook handling;
- source-token verification/consumption where the token model requires one-time behavior.

Delivering the same provider event repeatedly must not create duplicate purchases, entitlements, or earnings.

## Durable cross-module events

Critical cross-module events should use outbox/inbox or equivalent durable delivery patterns where appropriate.

If a transaction commits a purchase, entitlement or commission event must not be lost because the process crashes immediately afterward.

## Failure isolation

A module failure should affect only functionality that requires that capability.

Examples:

- currency provider down => canonical USD still works;
- notifications down => purchase can still succeed;
- analytics down => purchase/access processing can continue;
- Paystack disabled => another payment provider may remain usable;
- affiliate module unavailable => referral consequence is handled according to safe policy without corrupting purchase state.

Critical payment, purchase, ledger, and entitlement failures must fail safely rather than report success prematurely.

## Fraud threat model

The new model shifts the primary threats away from pay-per-click abuse and toward commerce, referral, and authorization abuse.

Attackers may attempt to:

- forge referral attribution;
- self-refer or coordinate accounts against policy;
- replay payment/provider callbacks;
- duplicate purchase completion;
- duplicate commission distribution;
- guess or forge `source` values;
- share protected access URLs/tokens;
- replay one-time access tokens;
- access a listing without an active entitlement;
- exploit refund/reversal timing;
- manipulate provider or currency data;
- abuse withdrawals.

Fraud/risk remains an independent capability and must not own money, purchase state, or entitlement state.

## Access security

The destination query parameter is not trusted merely because it is named `source`.

The source value must be an opaque or cryptographically verifiable token tied to authorization context.

Verification should check the properties required by the chosen token model, such as:

- token validity;
- entitlement state;
- listing binding;
- expiry;
- revocation;
- one-time consumption/replay state where applicable;
- destination/integration binding where appropriate.

Never expose unnecessary buyer personal data in the token or verification response.

## Referral risk

Referral earnings are based on valid purchases, not clicks.

Risk systems may consider account relationships, repeated buyer/referrer patterns, unusual conversion velocity, payment reversals, device/network signals, and other evidence without making those implementation details part of the public economic contract.

## Pending earnings

Seller/referral earnings may remain pending according to provider settlement, refund, risk, or platform policy.

The UI should distinguish pending, available, withdrawal-reserved, paid, reversed, and other meaningful states where supported.

## Audit trail

Material system changes must be traceable.

Audit records should make it possible to answer:

- what happened?
- when?
- who or what initiated it?
- previous and new state;
- which listing, purchase, payment, entitlement, referral, withdrawal, or provider reference was involved?
- which correlation/idempotency key ties related operations together?

## Financial history

Financial records are append-only in principle. Incorrect outcomes are corrected through compensating entries rather than deleting or silently rewriting history.

## State machines

Important processes use explicit state transitions.

Examples may include:

Purchase: `pending -> paid -> completed`

Entitlement: `active -> revoked` with future states only when needed.

Withdrawal: `requested -> under_review -> approved -> sent -> completed`

Invalid transitions must be rejected and logged.

## Architectural reliability tests

Tests should include:

- deliver one payment webhook repeatedly => one purchase and one entitlement;
- retry purchase completion => no duplicate seller/referral credits;
- change listing metadata after purchase => historical purchase terms remain unchanged;
- forge a raw user/purchase ID as `source` => access denied;
- expired/revoked source token => access denied;
- valid source token for wrong listing => access denied;
- remove analytics => purchase still completes;
- disable one payment provider => unrelated providers remain usable;
- affiliate/referral module returns relationship/distribution data but never writes ledger entries;
- refund/reversal, where supported, uses compensating ledger and explicit entitlement consequences.

These tests validate the architecture itself, not merely endpoint happy paths.
