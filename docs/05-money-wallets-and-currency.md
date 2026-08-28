# Money, Wallets, and Currency

[Back to documentation index](./README.md)

## Canonical currency

USD is Cliqero's canonical accounting currency.

Listings may be displayed or paid in convenient supported currencies, but financially meaningful internal values must preserve a canonical accounting value and the original transaction context.

Currency conversion must never silently mutate historical listing purchases or ledger entries.

## Money representation

Financial amounts must never use floating-point arithmetic.

Use integer minor units plus currency identity, or an equivalent precise Money value object.

Examples:

- USD 10.00 => amount `1000`, currency `USD`;
- NGN 5,000.00 => amount `500000`, currency `NGN`.

## Purchase-first money flow

The old campaign-reservation model is superseded.

The core financial flow is:

`Buyer payment -> provider verification -> purchase -> ledger distribution -> entitlement`

The payment provider verifies external money. The purchase domain determines the commercial fact. The ledger records the financial consequences. The entitlement domain records the buyer's access right.

No module should bypass these boundaries by directly changing balances.

## Ledger

The ledger is the financial source of truth.

Balances must not be maintained through arbitrary direct balance updates.

Every financial consequence creates immutable ledger entries, for example:

- buyer payment settlement/accounting entry;
- seller earning;
- referrer/promoter commission;
- referral/upline commission where enabled;
- platform earning;
- provider fee;
- manual adjustment;
- withdrawal reservation;
- payout completion;
- refund/reversal/compensating entry.

Visible balances are derived from ledger state.

## External payment record

A payment record should preserve enough information to reconstruct what happened:

- provider name;
- provider reference;
- provider amount;
- provider currency;
- canonical USD amount;
- exchange rate used where applicable;
- exchange-rate source/timestamp where applicable;
- verification state;
- purchase reference;
- idempotency key;
- audit/correlation IDs.

Provider retries must not create duplicate purchases, entitlements, commissions, or credits.

## Initial payment providers

The first production target may include Paystack and USDT TRC-20.

Providers implement a generic payment capability. Listing, purchase, entitlement, referral, and ledger code must not import Paystack- or TRON-specific logic.

Additional providers should be addable through provider registration rather than core rewrites.

## Sale distribution

A successful purchase has a gross sale value. Distribution policy determines how that value is allocated.

Possible recipients include:

- seller;
- direct referrer/promoter;
- applicable referral/upline recipients;
- Cliqero/platform;
- payment/provider fees where represented internally.

The affiliate/referral capability determines relationship/distribution facts but never writes ledger entries itself.

A commission/sale processor coordinates the consequence through the ledger capability.

## Seller earnings

Seller earnings should be explicitly distinguishable from buyer payments and referral earnings.

Policy may define pending/available states before withdrawal, especially where refunds, disputes, or provider settlement delays apply.

Do not invent complex settlement delays in V1 unless required, but keep the state model capable of representing them safely.

## Referral earnings

Referral commission exists only because a valid attributed purchase occurred.

Clicks, account registration, destination access, or page views do not directly create referral earnings.

Referral percentages and levels should remain runtime policy/configuration rather than hard-coded assumptions.

## Refunds and reversals

Historical financial entries must never be deleted or rewritten.

If refunds are supported, they must be modeled as explicit financial/domain operations with compensating ledger consequences.

Entitlement consequences must also be explicit. For example, a successfully refunded purchase may revoke access according to policy rather than silently deleting the entitlement.

Automatic external refunds do not need to be part of V1 unless required.

## Withdrawals

Payouts may be manual in the initial production release.

A user can request withdrawal of eligible available earnings. An operator reviews the request, sends the money manually, records the transfer/reference, and updates the withdrawal state.

Suggested lifecycle:

`requested -> under_review -> approved -> sent -> completed`

with rejection/failure states as required.

## Financial invariants

The following are non-negotiable:

- every financial mutation is represented in the ledger;
- all financially meaningful operations are idempotent;
- canonical value and original provider transaction context are preserved;
- provider/webhook retries do not duplicate purchases or distributions;
- historical financial records are not deleted;
- payment providers do not own purchase business logic;
- affiliate/referral modules do not move money;
- listing changes do not mutate historical purchase snapshots;
- manual administrative corrections use auditable compensating entries.
