# Initial Production Scope

[Back to documentation index](./README.md)

## Production-grade V1

Cliqero should not be built as a disposable MVP.

The first release should be deliberately narrow, but every included capability must be reliable, auditable, modular, tested, and designed for real money.

The rule is:

> Reduce scope, never reduce integrity.

## Included in the first production release

### Identity and accounts

- one account identity;
- advertiser capability;
- promoter capability;
- referral relationship;
- account settings and public handle management.

### Advertiser

- advertiser profile;
- reusable social/contact destinations;
- offer creation and management;
- offer-specific destination override;
- public advertiser and offer pages.

### Campaign

- wallet-funded campaign creation;
- campaign budget reservation;
- action value configuration;
- activate/pause/resume/close;
- basic campaign analytics;
- budget exhaustion behavior.

### Promoter

- browse eligible campaigns;
- specific offer promotion links;
- advertiser-focused promotion links;
- versatile promoter page;
- attributed sessions/actions;
- pending and available earnings.

### Referral

- platform referral links;
- direct referral relationship;
- configurable referral levels;
- upline/downline queries;
- distribution calculation only;
- no direct money processing inside the affiliate/referral module.

### Money

- canonical USD accounting;
- precise Money value object;
- immutable ledger;
- wallet;
- campaign reservations;
- Paystack funding;
- USDT TRC-20 funding;
- idempotent payment verification;
- internal release/reversal rules;
- manual withdrawals.

### Currency

- USD canonical values;
- convenient display conversion;
- local-currency transaction recording;
- graceful fallback to USD when conversion is unavailable.

### Attribution and fraud baseline

- promoter/session attribution;
- two-stage interaction tracking;
- CTA action records;
- duplicate/rate/session checks;
- pending/qualified/rejected action states;
- basic risk signals sufficient to prevent trivial abuse.

### Administration

- provider enable/disable controls;
- runtime policy management;
- offer/campaign moderation tools;
- withdrawal review and completion;
- audit visibility;
- basic fraud/action review.

### Infrastructure

- Next.js + TypeScript for current web surfaces;
- Docker-based development/production runtime;
- root Compose composition using `include`;
- independently composable service directories;
- durable event handling for critical financial flows;
- tests for module isolation and financial idempotency.

## Deliberately excluded from the initial release

The following may be valuable later but should not block the first reliable production release:

- automated bank payouts;
- automated crypto payouts;
- Stripe and large numbers of additional payment providers;
- deep machine-learning fraud models;
- native mobile apps;
- complex advertiser audience bidding;
- multi-touch attribution;
- verified purchase/conversion campaigns;
- enterprise APIs;
- managed advertising services;
- advanced promoter reputation scoring;
- sophisticated dynamic campaign replacement;
- many-level referral plans;
- automatic external payment refunds.

The architecture must allow these to be added later without rewriting unrelated modules.

## Suggested build order

1. architectural kernel and conventions;
2. identity/account capability;
3. Money, ledger, wallet, audit, and idempotency;
4. payment/currency providers;
5. advertiser profiles/destinations/offers;
6. public showcase surface;
7. campaign reservation/state machine;
8. promoter routes and attribution;
9. action qualification/fraud baseline;
10. affiliate/referral graph capability;
11. commission processor;
12. manual withdrawal flow;
13. administration and operational tooling;
14. reliability and architecture verification.

## Release readiness

The platform is not production-ready merely because its happy path works.

Before launch, it should prove at minimum:

- duplicate payment callbacks do not duplicate wallet credits;
- duplicate action events do not duplicate commissions;
- campaign reservations reconcile with ledger balances;
- removing optional capabilities causes graceful degradation;
- provider failures remain isolated;
- withdrawal history is auditable;
- offer-specific destinations do not overwrite global advertiser destinations;
- referral calculations do not write wallet state;
- all critical financial transitions have audit/correlation IDs;
- secret configuration is absent from version control;
- public and authenticated surfaces enforce correct authorization boundaries.
