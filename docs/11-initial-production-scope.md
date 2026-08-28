# Initial Production Scope

[Back to documentation index](./README.md)

## Production-grade V1

Cliqero should not be built as a disposable MVP.

The first release should be deliberately narrow, but every included capability must be reliable, auditable, modular, tested, and designed for real money and real access rights.

> Reduce scope, never reduce integrity.

## Included in the first production release

### Identity and accounts

- one account identity;
- seller capability;
- buyer capability;
- referrer/promoter capability;
- account referral relationship where enabled;
- account settings and public handle/profile management.

### Listings

- generic listing creation and management;
- title, description, price, media, metadata, destination, status/visibility;
- public listing pages;
- no separate ebook/software/course/service product models;
- seller profile/listing discovery surface where useful.

### Checkout and purchase

- checkout for a listing;
- supported payment-provider integration;
- idempotent payment verification;
- purchase records with immutable commercial snapshots;
- explicit purchase state;
- prevention of duplicate purchase completion from repeated callbacks.

### Entitlement and access

- entitlement created/activated from a successful purchase;
- buyer purchase/access library;
- access endpoint that validates entitlement before redirect;
- destination redirect with `source=<token>` where applicable;
- cryptographically random opaque bearer source credential containing no business data;
- server-side access-grant resolution from source credential to entitlement/purchase/listing context;
- secure hash persistence of bearer credentials where practical;
- independently authenticated API for an integrated destination to verify authorization within its permitted scope;
- access audit/history sufficient for security and investigation;
- no JWT/JWE/self-contained access-token model.

### Referrals / promotion

- attributed listing referral links;
- preservation of valid attribution through checkout;
- commission triggered by valid purchase, not clicks/views;
- direct referral commission policy;
- account referral graph/upline support only to the level actually configured;
- referral module returns distribution facts but never moves money.

### Money

- canonical USD accounting;
- precise Money value object;
- immutable ledger;
- seller and referral earnings;
- platform share/fee accounting;
- Paystack funding/payment support where selected;
- USDT TRC-20 support where selected;
- idempotent provider verification;
- auditable reversal/refund model if implemented;
- manual withdrawals.

### Currency

- USD canonical values;
- convenient display conversion;
- original transaction currency recording;
- graceful fallback to USD when conversion is unavailable.

### Fraud/security baseline

- referral attribution integrity;
- duplicate payment/purchase protection;
- opaque access-credential guessing/theft/replay protection appropriate to current server-side access policy;
- entitlement authorization checks;
- integration authentication and access-grant scoping;
- basic payment/referral/account risk signals;
- audit/correlation IDs for critical operations.

### Administration

- provider enable/disable controls;
- runtime policy management;
- listing moderation;
- purchase/payment/entitlement inspection;
- withdrawal review and completion;
- audit visibility;
- manual corrective actions through explicit state/ledger operations.

### Infrastructure

- Next.js + TypeScript for current web surfaces;
- Docker-based development/production runtime;
- root Compose composition using `include`;
- independently composable service directories;
- logical modules before unnecessary microservices;
- durable event handling for critical financial/access flows;
- tests for module isolation and financial/idempotency boundaries.

## Deliberately excluded from the initial release

Do not let these block the first production build:

- product-type-specific ebook readers;
- file hosting as a requirement of selling;
- software license management;
- course hosting;
- video streaming;
- SaaS provisioning logic inside Cliqero;
- complex entitlement variants without a real requirement;
- automated bank payouts;
- large numbers of payment providers;
- deep machine-learning fraud models;
- native mobile apps;
- enterprise APIs beyond the access-verification contract needed by integrated destinations;
- sophisticated dynamic referral pages;
- automatic external refunds unless required;
- speculative product-specific fields.

These may be introduced later as independent capabilities or metadata extensions without changing the core listing/purchase/entitlement model.

## Suggested build order

1. architectural kernel, module conventions, and root Compose include flow;
2. identity/account capability;
3. Money, ledger, audit, and idempotency foundations;
4. payment and currency provider contracts;
5. generic listing capability and public listing surface;
6. checkout and purchase state machine;
7. entitlement capability;
8. opaque access handoff and authenticated `source` verification API;
9. referral attribution for listing links;
10. affiliate/referral graph and distribution calculation;
11. purchase/commission processor and earnings;
12. manual withdrawal flow;
13. administration and moderation;
14. reliability, authorization, and architecture verification.

## Release readiness

Before launch, prove at minimum:

- repeated payment callbacks create one financial purchase consequence;
- one successful purchase creates the intended entitlement exactly once;
- listing edits never mutate historical purchase snapshots;
- referral commission cannot be created by a click alone;
- duplicate commission processing does not duplicate ledger credits;
- forged raw IDs in `source` are rejected;
- malformed/unknown/revoked source credentials are rejected;
- an authenticated integration cannot introspect access grants outside its permitted scope;
- raw bearer credentials are not recoverably stored where hashing is intended;
- a valid entitled buyer can access the configured destination;
- a non-entitled account cannot;
- optional provider/module failures remain isolated where safe;
- referral calculations do not write ledger state;
- all critical financial and authorization transitions are auditable;
- secret configuration is absent from version control;
- Docker Compose `include` structure remains the composition mechanism rather than collapsing modules into one hard-coupled service.
