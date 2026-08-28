# Reliability, Fraud, and Audit

[Back to documentation index](./README.md)

## Reliability standard

Cliqero handles real money and financially meaningful attribution. The first release may have limited scope, but implemented behavior must be reliable enough for production use.

The system should be designed for retries, duplicate webhooks, partial failures, unavailable optional modules, and administrative investigation.

## Idempotency

Every financially meaningful operation must be idempotent.

Examples:

- payment verification;
- wallet funding;
- campaign reservation;
- campaign release;
- payable action distribution;
- promoter/referral credits;
- withdrawal state transitions;
- provider webhook handling.

If a provider or worker delivers the same event repeatedly, the underlying financial consequence must occur once.

## Outbox and inbox patterns

Cross-module events should use durable delivery patterns where appropriate.

If a database transaction commits a qualified action, the corresponding event must not be lost because the process crashed one millisecond later.

An outbox/inbox or equivalent durable event pattern should be used for critical asynchronous work.

## Failure isolation

A module failure should affect only functionality that requires that capability.

Examples:

- currency provider down => canonical USD still works;
- notifications down => funding can still succeed;
- analytics down => action processing can still succeed;
- affiliate unavailable => referral distribution cannot be calculated, but unrelated pages remain available;
- Paystack disabled => other payment providers continue working.

The system should return explicit capability-unavailable responses rather than crash during application startup because an optional module is missing.

## Fraud threat model

The promoter model is attractive to abuse because rewards are tied to attributable actions.

A fraudster may attempt to:

- repeatedly activate their own CTA links;
- automate browser actions;
- use bot networks;
- rotate IPs or proxies;
- coordinate multiple accounts;
- simulate engagement;
- drain campaign budgets with low-quality traffic;
- exploit retries or race conditions to double-credit rewards.

Fraud resistance is therefore a core product requirement, not a later analytics feature.

## Two-stage interaction

A promoter should not be rewarded merely because the promoter referral URL is opened.

The basic sequence is:

`promoter link -> Cliqero offer/profile -> visitor chooses CTA -> qualification -> reward eligibility`

This increases the cost of trivial click fraud and aligns the reward with intentional visitor behavior.

## Fraud/risk capability

Fraud scoring should be an independent capability.

It may consider signals such as:

- duplicate sessions/devices;
- unusual action velocity;
- IP/network characteristics;
- proxy/data-center likelihood;
- geography anomalies;
- repeated destination actions;
- account relationship patterns;
- promoter-level risk history;
- campaign-specific patterns.

The fraud capability returns risk/qualification information. It must not own campaign money or wallet credits.

## Pending earnings

Promoter earnings may remain pending while actions pass qualification and risk review.

The UI should clearly distinguish:

- pending earnings;
- available/withdrawable earnings;
- withdrawal-reserved amounts;
- paid amounts.

## Audit trail

Material system changes must be traceable.

Audit records should make it possible to answer:

- what happened?
- when did it happen?
- who or what initiated it?
- what was the previous state?
- what is the new state?
- which transaction, action, campaign, user, or provider reference is involved?
- which correlation/idempotency key ties related operations together?

## Financial history

Financial records are append-only in principle.

Incorrect or exceptional outcomes should be corrected through compensating entries rather than deleting or silently modifying history.

This is necessary for disputes, operator investigation, and ledger reconciliation.

## State machines

Important processes use explicit state transitions.

Suggested examples:

Campaign:

`draft -> funded -> active -> paused -> exhausted -> closed`

Action:

`observed -> pending -> qualified -> distributed`

or

`pending -> rejected`

Withdrawal:

`requested -> under_review -> approved -> sent -> completed`

Invalid transitions must be rejected and logged.

## Architectural reliability tests

Tests should verify failure behavior in addition to happy paths.

Examples:

- deliver one payment webhook ten times => wallet credits once;
- remove currency capability => offer still renders in USD;
- disable Paystack => USDT remains usable;
- remove notifications => payment still completes;
- remove analytics => action can still qualify/distribute;
- close a campaign => unused reservation returns to wallet;
- reject action before distribution => reserved value is restored;
- retry worker after partial failure => no duplicate ledger credits;
- attempt normal refund after commission distribution => rejected according to policy;
- affiliate module returns graph data but never writes wallet entries.

These tests validate the architecture itself, not merely individual endpoints.
